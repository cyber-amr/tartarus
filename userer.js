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
        this.isEmailVerified = data.isEmailVerified
        this.hashedPassword = data.hashedPassword
        this.signupIP = data.signupIP
    }

    static async get(query) {
        const data = await db.collection("secrets").findOne(query)
        return data ? new User(data) : null
    }

    async update(data) {
        return await db.collection('secrets').updateOne({ _id: this._id }, data)
    }
}

const q = new Set()
async function createUser(data, ip) {
    const username = data.username
    if (!username || typeof username !== "string" || !/^[A-Za-z0-9_]{1,16}$/.test(username))
        return { error: 'username is required, max 16 characters of A-z, 0-9 and _ only' }

    const email = data.email
    if (!email || typeof email !== "string") return { error: 'email is required' }
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) return { error: 'Unsupported email format' }

    const rawPassword = data.password
    if (!rawPassword || typeof rawPassword !== "string" || !/^(?=.*[a-zA-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,32}$/.test(rawPassword))
        return { error: 'password is required, 8-32 length and must have a letter, a numbers and a special character' }

    const currentDate = new Date()
    const birthDate = new Date(data.birthDate)
    const maxDate = (new Date(currentDate.setFullYear(currentDate.getFullYear() - 13)))
    if (!birthDate || !(birthDate instanceof Date) || !((new Date('1919-01-01')).getTime() < birthDate.getTime() && birthDate.getTime() <= maxDate.getTime()))
        return { error: 'birthDate is required, +13y age' }

    const displayName = data.displayName
    if (displayName && (typeof displayName !== 'string' || displayName.length > 16))
        return { error: 'displayName cannot exceed 16 characters' }

    if (q.has(username) || !!(await db.collection("users").findOne({ username }))) return { errorCode: 409, error: 'username already in use, try another' }
    q.add(username)

    if (q.has(email) || !!(await db.collection("secrets").findOne({ email: { address: email } }))) {
        q.delete(username)
        return { errorCode: 409, error: 'email already registered, try logging-in' }
    }
    q.add(email)

    const _id = userSnowflaker.nextId()
    const hashedPassword = hash(_id + rawPassword + process.env.SECRET_SALT ?? "")

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
            email: { address: email, isVerified: false },
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

module.exports = { User, SecretUser, createUser }
