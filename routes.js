const router = require('express').Router()
const path = require('path')

// Static page routes
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'html', 'index.html'))
})

// Error handling middleware
router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something broke!' })
})

module.exports = router;
