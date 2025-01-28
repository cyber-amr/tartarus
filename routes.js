const router = require('express').Router()
const path = require('path')
const db = require("./db.js")

// Static page routes
router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'html', 'index.html')))

// API routes
router.post('/api/available-username', async (req, res) => {
    const username = req.body?.username
    if (!username) return res.status(400).json({ error: 'username is required' })

    if (!db.ready) return res.status(503).json({
        error: 'Service Unavailable',
        message: 'We experiencing high load. Please try again later.',
    })

    // TODO: add rateLimits

    res.json({ available: !(await db.collection("users").findOne({ username })) })
})

router.post('/api/registered-email', async (req, res) => {
    const email = req.body?.email
    if (!email) return res.status(400).json({ error: 'email is required' })

    if (!db.ready) return res.status(503).json({
        error: 'Service Unavailable',
        message: 'We experiencing high load. Please try again later.',
    })

    // TODO: add rateLimits

    res.json({ registered: !!(await db.collection("users").findOne({ email })) })
})

// Error handling middleware
router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something broke!' })
})

// 404 handler
router.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'html', '404.html')))

module.exports = router;
