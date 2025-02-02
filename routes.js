const router = require('express').Router()
const path = require('path')
const { rateLimit } = require('express-rate-limit')
const db = require("./db.js")

// Static page routes
router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'html', 'index.html')))

// Auth routes
router.get('/signup', (req, res) => res.sendFile(path.join(__dirname, 'html', 'signup.html')))
router.post('/signup', async (req, res) => {
    if (!req.body) return res.status(400).json({ error: "request body is empty" })
    const { error, errorCode, _id } = await createUser(req.body, req.headers['x-forwarded-for'] ?? req.ip)
    if (error) return res.status(errorCode ?? 400).json({ error })

    res.status(201).set('Location', `/api/users/${_id}`)
})

// API routes
router.use('/api', rateLimit({
    keyGenerator: (req) => req.headers['x-forwarded-for'] ?? req.ip,
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

    res.json({ registered: !!(await db.collection("secrets").findOne({ email: { address: email } })) })
})

// Error handling middleware
router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something broke!' })
})

// 404 handler
router.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'html', '404.html')))

module.exports = router;
