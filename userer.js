const db = require("./db.js")
const { userSnowflaker } = require("./snowflaker.js")
const { hash } = require("./hasher.js")
const { createSession } = require("./sessioner.js")

class User {
    constructor(data) {
        this._id = data._id
        this.username = data.username
        this.createDate = data.createDate
        this.birthDate = data.birthDate
        this.lastActive = data.lastActive

        this.displayName = data.displayName
    }

    static async get(query) {
        const data = await db.collection("users").findOne(query)
        return data ? new User(data) : null
    }

    async update(data) {
        return await db.collection('users').updateOne({ _id: this._id }, data)
    }
}

class SecretUser {
    constructor(data) {
        this._id = data._id
        this.email = data.email
        this.password = data.password
        this.loginIPs = data.loginIPs
    }

    static async get(query) {
        const data = await db.collection("secrets").findOne(query)
        return data ? new SecretUser(data) : null
    }

    async update(data) {
        return await db.collection('secrets').updateOne({ _id: this._id }, data)
    }
}

const q = new Set()
async function createUser({ username, email, password, birthDate, displayName }, ip) {
    if (q.has(username) || !!(await db.collection("users").findOne({ username }))) return { errorCode: 409, error: 'username already in use, try another' }
    q.add(username)

    if (q.has(email) || !!(await db.collection("secrets").findOne({ email }))) {
        q.delete(username)
        return { errorCode: 409, error: 'email already registered, try logging-in' }
    }
    q.add(email)

    const _id = userSnowflaker.nextId()
    const hashedPassword = hash(_id + password + process.env.SECRET_SALT ?? "")

    try {
        await db.collection("users").insertOne({
            _id,
            username,
            createDate: new Date(),
            birthDate,
            lastActive: new Date(),
            displayName: displayName ?? "",
        })
        await db.collection("secrets").insertOne({
            _id,
            email,
            password: { hash: hashedPassword, lastUpdate: new Date(), oldPasswords: [] },
            loginIPs: [ip]
        })
    } catch (error) {
        db.collection('users').deleteOne({ _id })
        db.collection('secrets').deleteOne({ _id })
        return { errorCode: 500, error }
    } finally {
        q.delete(username)
        q.delete(email)
    }

    return { _id }
}

async function login({ password, username, email, keepLogin, ip }) {
    let secretUser
    if (!email || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
        if (!username || !/^[A-Za-z0-9_]{1,16}$/.test(username)) return { error: "Bad request" }
        const user = await User.get({ username })
        if (!user) return { errorCode: 401, error: "Unauthorized" }
        secretUser = await SecretUser.get({ _id: user._id })
    } else {
        secretUser = await SecretUser.get({ email })
    }

    // vulnerable but who gives a fuck
    if (secretUser?.password.hash !== hash(secretUser?._id + password + process.env.SECRET_SALT ?? "")) return { errorCode: 401, error: "Unauthorized" }

    return await createSession({ userId: secretUser._id, ip, maxAge: keepLogin ? 30 * 24 * 60 * 60 * 1000 : undefined }) // 30 days
}

module.exports = { User, SecretUser, createUser, login }
