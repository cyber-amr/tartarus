const router = require('express').Router()

const { sessionParser } = require('../sessioner')
const { rateLimit } = require('express-rate-limit')
const { User, SecretUser } = require('../userer')

router.use('/private-api', sessionParser({ touch: true, required: true }), rateLimit({
    keyGenerator: (req) => req.session.userId,
    limit: 100,
    windowMs: 60 * 1000
}))

router.get('/private-api/user', async (req, res) => {
    const user = await User.get({ _id: req.session.userId }).catch(error => res.status(500).json({ error }))
    user.email = (await SecretUser.get({ _id: req.session.userId })).email
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

module.exports = router;
