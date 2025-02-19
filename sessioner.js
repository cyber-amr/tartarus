const DEFAULT_EXPIRE_TIME = 48 * 60 * 60 * 1000 // 48 hours

const { randomUUID } = require('crypto')
const db = require("./db")

class Session {
    constructor(data) {
        this._id = data._id
        this.userId = data.userId

        this.createDate = data.createDate
        this.lastActive = data.lastActive
        this.expireDate = data.expireDate
        this.maxAge = data.maxAge

        this.IPs = data.IPs
    }

    static async get(_id) {
        const data = await db.collection('sessions').findOne({ _id })
        return data ? new Session(data) : null
    }

    static async getAll(userId) {
        return (await db.collection('sessions').find({ userId }).toArray()).map(v => new Session(v))
    }

    async update(data) {
        return await db.collection('sessions').updateOne({ _id: this._id }, data)
    }

    async touch() {
        const newExpireDate = new Date(Date.now() + this.maxAge)
        db.collection('users').updateOne({ _id: this.userId }, { $set: { lastActive: new Date() } }).catch(e => console.error(e))
        const result = await db.collection('sessions').updateOne({ _id: this._id }, {
            $set: {
                lastActive: new Date(),
                expireDate: newExpireDate
            }
        })
        result.newExpireDate = newExpireDate
        return result
    }

    destroy(res) {
        db.collection('sessions').deleteOne({ _id: this._id }).catch(e => console.error(e))
        res?.clearCookie('sessionId')
    }
}

async function createSession({ userId, ip, maxAge = DEFAULT_EXPIRE_TIME }) {
    const _id = randomUUID()
    const data = {
        _id,
        userId,
        createDate: new Date(),
        lastActive: new Date(),
        expireDate: new Date(Date.now() + maxAge),
        maxAge,
        IPs: [ip]
    }
    const result = await db.collection('sessions').insertOne(data)
    if (!result.acknowledged) return { errorCode: 500, error: 'MongoDB error, could not insert new session data' }

    return new Session(data)
}

function sessionParser({ touch = false, required = false } = {}) {
    return async (req, res, next) => {
        const _id = req.signedCookies.sessionId
        req.session = await Session.get(_id)

        if (req.session && req.session.expireDate.getTime() < Date.now()) {
            req.session.destroy(res)
            req.session = null
        }
        if (!req.session) return required ? res.status(401).json({ error: 'Unauthorized' }) : next()

        if (touch) {
            const { acknowledged, newExpireDate } = req.session.touch()
            const expires = newExpireDate

            if (acknowledged) {
                req.session.expireDate = expires
                res.cookie('sessionId', _id, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV !== 'development',
                    sameSite: "strict",
                    path: '/',
                    expires
                })
            }
        }

        next()
    }
}

module.exports = { Session, createSession, sessionParser }
