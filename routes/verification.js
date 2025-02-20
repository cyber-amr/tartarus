const router = require('express').Router()
const { sessionParser } = require('../sessioner')
const { rateLimit } = require('express-rate-limit')
const { isEmail, isToken } = require('../validater')
const { sendVerificationEmail, isValidVerification } = require('../emailer')

const getIP = (req) => req.headers['x-forwarded-for'] ?? req.ip

router.post('/verification/request', sessionParser(), rateLimit({
    keyGenerator: (req) => req.body?.email ?? getIP(req),
    skipFailedRequests: true,
    limit: 3,
    windowMs: 30 * 60 * 1000
}), async (req, res) => {
    if (req.session) return res.status(403).json({ error: 'Forbidden' })

    const email = req.body?.email
    if (!email) return res.status(400).json({ error: 'email is required' })
    if (!isEmail(email)) return res.status(400).json({ error: 'Unsupported email format' })

    const { error, errorCode, sent } = await sendVerificationEmail(email, 'create an account')

    if (error) return res.status(errorCode ?? 400).json({ error })

    res.status(202).json({ sent })
})

router.post('/verification/is-valid', sessionParser(), rateLimit({
    keyGenerator: (req) => req.body?.email ?? getIP(req),
    skipSuccessfulRequests: true,
    limit: 3,
    windowMs: 30 * 60 * 1000,
}), (req, res) => {
    if (req.session) return res.status(403).json({ error: 'Forbidden' })

    const email = req.body?.email
    const token = req.body?.token

    if (!isEmail(email) || !isToken(token)) return res.status(400).json({ error: 'email and token are required' })

    isValidVerification(email, token).then(isValid => res.status(200).json({ isValid }))
})

module.exports = router;
