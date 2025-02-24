const router = require('express').Router()
const path = require('path')
const { sessionParser } = require('../sessioner')
const { rateLimit } = require('express-rate-limit')
const { isStr, isEmail, isToken, isUsername, isPassword, isDateIn, isDisplayName } = require('../validater')
const { sendVerificationEmail, isValidVerification, destroyVerification } = require('../emailer')
const { createUser, login } = require('../userer')

const getIP = (req) => req.headers['x-forwarded-for'] ?? req.ip

router.get('/signup', sessionParser(), (req, res) => {
    if (req.session) return res.redirect(302, "/")
    res.sendFile(path.join(__rootdir, 'html', 'signup.html'))
})
router.post('/signup',
    rateLimit({ keyGenerator: req => getIP(req), limit: 3, windowMs: 30 * 60 * 1000 }),
    rateLimit({ keyGenerator: req => getIP(req), limit: 1, windowMs: 300 * 1000, skipFailedRequests: true }),
    sessionParser(),
    async (req, res) => {
        if (req.session) return res.status(403).send("Already logged in")
        if (!req.body) return res.status(400).send("request body is empty")

        const email = req.body.email
        if (!isStr(email)) return res.status(400).send('email is required')
        if (!isEmail(email)) return res.status(400).send('Unsupported email format')

        const token = req.body.token
        if (!isToken(token) || !(await isValidVerification(email, token, 'create an account'))) return res.status(403).send('Invalid verification code')

        const username = req.body.username
        if (!isUsername(username)) return res.status(400).send('username is required, max 16 characters of A-z, 0-9 and _ only')

        const password = req.body.password
        if (!isPassword(password)) return res.status(400).send('password is required, 8-32 length and must have a letter, a numbers and a special character')

        const birthDate = new Date(req.body.birthDate)
        const [minDate, maxDate] = [new Date('1919-01-01'), new Date(Date.now() - 13 * 365 * 24 * 60 * 60 * 1000)] // 13 years before
        if (!isDateIn(birthDate, minDate, maxDate)) return res.status(400).send('birthDate is required, +13y age')

        const displayName = req.body.displayName ?? ''
        if (!isDisplayName(displayName)) return res.status(400).send('displayName cannot exceed 16 characters')

        const { error, errorCode } = await createUser({ username, email, password, birthDate, displayName }, getIP(req))
        if (error) return res.status(errorCode ?? 400).send(error)

        destroyVerification(email, { token })

        res.status(201).send('successful')
    }
)

router.get('/login', sessionParser(), (req, res) => {
    if (req.session) return res.redirect(302, "/")
    res.sendFile(path.join(__rootdir, 'html', 'login.html'))
})
router.post('/login', rateLimit({ keyGenerator: req => getIP(req), limit: 5, windowMs: 30 * 1000 }), sessionParser(), async (req, res) => {
    if (req.session) return res.status(403).send("Already logged in")
    const password = req.body?.password
    const username = req.body?.username
    const email = req.body?.email
    const keepLogin = !!req.body?.keepMeLoggedIn
    if (!isPassword(password) || (!isUsername(username) && !isEmail(email))) return res.status(400).send("Bad request")

    const { errorCode, error, _id, expireDate } = await login({ password, username, email, keepLogin, ip: getIP(req) })
    if (error) return res.status(errorCode ?? 400).send(error)

    res.cookie('sessionId', _id, {
        httpOnly: true,
        signed: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: "strict",
        path: '/',
        expires: expireDate
    })
    return res.status(201).send('successful')
})

router.get('/logout', sessionParser({ required: true }), (req, res) => res.sendFile(path.join(__rootdir, 'html', 'logout.html')))
router.post('/logout', sessionParser({ required: true }), async (req, res) => {
    req.session.destroy(res)
    res.status(200).send('successful')
})

router.post('/request-verification/', sessionParser(), rateLimit({
    keyGenerator: (req) => req.body?.email ?? getIP(req),
    skipFailedRequests: true,
    limit: 3,
    windowMs: 30 * 60 * 1000
}), async (req, res) => {
    if (req.session) return res.status(403).send('Forbidden')

    const email = req.body?.email
    if (!email) return res.status(400).send('email is required')
    if (!isEmail(email)) return res.status(400).send('Unsupported email format')

    const { error, errorCode, sent } = await sendVerificationEmail(email, 'create an account')

    if (error || !sent) return res.status(errorCode ?? 400).send(error ?? 'Failed send verification email')

    res.status(202).send('successful')
})

router.post('/is-valid-verification', sessionParser(), rateLimit({
    keyGenerator: (req) => req.body?.email ?? getIP(req),
    skipSuccessfulRequests: true,
    limit: 3,
    windowMs: 30 * 60 * 1000,
}), async (req, res) => {
    if (req.session) return res.status(403).send('Forbidden')

    const email = req.body?.email
    const token = req.body?.token

    if (!isEmail(email) || !isToken(token)) return res.status(400).send('email and token are required')

    res.status(200).send(await isValidVerification(email, token))
})

module.exports = router;
