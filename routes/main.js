const router = require('express').Router()
const path = require('path')

// Error handling middleware
router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Something broke!' })
})

// 404 handler
router.use((req, res) => res.status(404).sendFile(path.join(__rootdir, 'html', '404.html')))

module.exports = router;
