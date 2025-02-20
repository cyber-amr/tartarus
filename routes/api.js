const router = require('express').Router()

const getIP = (req) => req.headers['x-forwarded-for'] ?? req.ip

router.use('/api', rateLimit({
    keyGenerator: (req) => getIP(req),
    limit: 15,
    windowMs: 30 * 1000
}))

router.post('/api/available-username', async (req, res) => {
    const username = req.body?.username
    if (!isUsername(username)) return res.status(400).json({ error: 'username is required, max 16 characters of A-z, 0-9 and _ only' })

    res.json({ available: !(await db.collection("users").findOne({ username })) })
})

router.post('/api/registered-email', async (req, res) => {
    const email = req.body?.email
    if (!email) return res.status(400).json({ error: 'email is required' })
    if (!isEmail(email)) return res.status(400).json({ error: 'Unsupported email format' })

    res.json({ registered: !!(await db.collection("secrets").findOne({ email })) })
})

module.exports = router;
