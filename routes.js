const router = require('express').Router()
const path = require('path')
const { rateLimit } = require('express-rate-limit')
const db = require("./db.js")
const { createUser, login, User, SecretUser } = require('./userer.js')
const { sessionParser } = require('./sessioner.js')
const { sendVerificationEmail, isValidVerification, destroyVerification } = require('./emailer.js')

const isStr = (x) => x && typeof x === "string"
const getIP = (req) => req.headers['x-forwarded-for'] ?? req.ip

// Static page routes
router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'html', 'index.html')))

// Auth routes
router.get('/signup', sessionParser(), (req, res) => {
    if (req.session) return res.redirect(302, "/")
    res.sendFile(path.join(__dirname, 'html', 'signup.html'))
})
router.post('/signup',
    rateLimit({ keyGenerator: req => getIP(req), limit: 3, windowMs: 30 * 60 * 1000 }),
    rateLimit({ keyGenerator: req => getIP(req), limit: 1, windowMs: 300 * 1000, skipFailedRequests: true }),
    sessionParser(),
    async (req, res) => {
        if (req.session) return res.status(403).json({ error: "Already logged in" })
        if (!req.body) return res.status(400).json({ error: "request body is empty" })

        const email = req.body.email
        if (!isStr(email)) return res.status(400).json({ error: 'email is required' })
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) return res.status(400).json({ error: 'Unsupported email format' })

        const token = req.body.token
        if (!isStr(token) || !(await isValidVerification(email, token))) return res.status(403).json({ error: 'Invalid verification code', redirect: '/signup?status=expired' })

        const username = req.body.username
        if (!isStr(username) || !/^[A-Za-z0-9_]{1,16}$/.test(username)) return res.status(400).json({ error: 'username is required, max 16 characters of A-z, 0-9 and _ only' })

        const password = req.body.password
        if (!isStr(password) || !/^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,32}$/.test(password))
            return res.status(400).json({ error: 'password is required, 8-32 length and must have a letter, a numbers and a special character' })

        const birthDate = new Date(req.body.birthDate)
        const [minDate, maxDate] = [new Date('1919-01-01'), new Date(Date.now() - 13 * 365 * 24 * 60 * 60 * 1000)] // 13 years before
        if (isNaN(birthDate) || minDate.getTime() > birthDate.getTime() || maxDate.getTime() < birthDate.getTime())
            return res.status(400).json({ error: 'birthDate is required, +13y age' })

        const displayName = req.body.displayName
        if (displayName && (typeof displayName !== 'string' || displayName.length > 16))
            return res.status(400).json({ error: 'displayName cannot exceed 16 characters' })

        const { error, errorCode } = await createUser({ username, email, password, birthDate, displayName }, getIP(req))
        if (error) return res.status(errorCode ?? 400).json({ error })

        destroyVerification(email, { token })

        res.status(201).redirect(`/login?username=${username}`)
    }
)

router.get('/login', sessionParser(), (req, res) => {
    if (req.session) return res.redirect(302, "/")
    res.sendFile(path.join(__dirname, 'html', 'login.html'))
})
router.post('/login', rateLimit({ keyGenerator: req => getIP(req), limit: 5, windowMs: 30 * 1000 }), sessionParser(), async (req, res) => {
    if (req.session) return res.status(403).json({ error: "Already logged in" })
    const password = req.body?.password
    const username = req.body?.username
    const email = req.body?.email
    const keepLogin = req.body?.keepMeLoggedIn
    if (!isStr(password) || (!isStr(username) && !isStr(email))) return res.status(400).json({ error: "Bad request" })

    const { errorCode, error, _id, expireDate } = await login({ password, username, email, keepLogin, ip: getIP(req) })
    if (error) return res.status(errorCode ?? 400).json({ error })

    res.cookie('sessionId', _id, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: "strict",
        path: '/',
        expires: expireDate
    })
    return res.status(201).redirect('/')
})

router.get('/logout', sessionParser({ required: true }), (req, res) => res.sendFile(path.join(__dirname, 'html', 'logout.html')))
router.post('/logout', sessionParser({ required: true }), async (req, res) => {
    req.session.destroy(res)
    res.status(200).redirect('/login')
})

// API routes
router.use('/api', rateLimit({
    keyGenerator: (req) => getIP(req),
    limit: 15,
    windowMs: 30 * 1000
}))

router.post('/api/available-username', async (req, res) => {
    const username = req.body?.username
    if (!username) return res.status(400).json({ error: 'username is required' })

    res.json({ available: !(await db.collection("users").findOne({ username })) })
})

router.post('/api/registered-email', async (req, res) => {
    const email = req.body?.email
    if (!email) return res.status(400).json({ error: 'email is required' })

    res.json({ registered: !!(await db.collection("secrets").findOne({ 'email.address': email })) })
})

router.post('/api/request-verification-email', sessionParser(), rateLimit({
    keyGenerator: (req) => req.body?.email ?? getIP(req),
    skipFailedRequests: true,
    limit: 3,
    windowMs: 30 * 60 * 1000
}), async (req, res) => {
    if (req.session) return res.status(403).json({ error: 'Unauthorized' })

    const email = req.body?.email
    if (!email) return res.status(400).json({ error: 'email is required' })
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) return res.status(400).json({ error: 'Unsupported email format' })

    const { error, errorCode, sent } = await sendVerificationEmail(email, 'create an account')

    if (error) return res.status(errorCode ?? 400).json({ error })

    res.status(202).json({ sent })
})

router.use('/private-api', sessionParser({ touch: true, required: true }), rateLimit({
    keyGenerator: (req) => req.session.userId,
    limit: 15,
    windowMs: 30 * 1000
}))

router.get('/private-api/user', async (req, res) => {
    const user = await User.get({ _id: req.session.userId }).catch(error => res.status(500).json({ error }))
    user.email = (await SecretUser.get({ _id: req.session.userId })).email.address
    res.status(200).json(user)
})

router.get('/private-api/session', (req, res) => {
    res.status(200).send({
        userId: req.session.userId,
        createDate: req.session.createDate,
        lastActive: req.session.lastActive,
        expireDate: req.session.expireDate
    })
})

// Error handling middleware
router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something broke!' })
})

// 404 handler
router.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'html', '404.html')))

module.exports = router;
