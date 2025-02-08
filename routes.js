const router = require('express').Router()
const path = require('path')
const { rateLimit } = require('express-rate-limit')
const db = require("./db.js")
const { createUser, login } = require('./userer.js')
const { sessionParser } = require('./sessioner.js')

const isStr = (x) => x && typeof x === "string"
const getIP = (req) => req.headers['x-forwarded-for'] ?? req.ip

// Static page routes
router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'html', 'index.html')))

// Auth routes
router.get('/signup', sessionParser(), (req, res) => {
    if (req.session) return res.redirect(302, "/")
    res.sendFile(path.join(__dirname, 'html', 'signup.html'))
})
router.post('/signup', rateLimit({ keyGenerator: req => getIP(req), limit: 1, windowMs: 300 * 1000, skipFailedRequests: true }), sessionParser(), async (req, res) => {
    if (req.session) return res.status(403).json({ error: "Already logged in" })
    if (!req.body) return res.status(400).json({ error: "request body is empty" })
    const { error, errorCode } = await createUser(req.body, getIP(req))
    if (error) return res.status(errorCode ?? 400).json({ error })

    res.status(201).redirect("/login")
})

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
    res.redirect('/login')
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

    if (!db.ready) return res.status(503).json({
        error: 'Service Unavailable',
        message: 'We experiencing high load. Please try again later.',
    })

    res.json({ available: !(await db.collection("users").findOne({ username })) })
})

router.post('/api/registered-email', async (req, res) => {
    const email = req.body?.email
    if (!email) return res.status(400).json({ error: 'email is required' })

    if (!db.ready) return res.status(503).json({
        error: 'Service Unavailable',
        message: 'We experiencing high load. Please try again later.',
    })

    res.json({ registered: !!(await db.collection("secrets").findOne({ 'email.address': email })) })
})

router.use('/private-api', sessionParser({ touch: true, required: true }), rateLimit({
    keyGenerator: (req) => req.session.userId,
    limit: 15,
    windowMs: 30 * 1000
}))

router.get('/private-api/session/create-date', (req, res) => {
    res.status(200).send(req.session.createDate)
})

// Error handling middleware
router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something broke!' })
})

// 404 handler
router.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'html', '404.html')))

module.exports = router;
