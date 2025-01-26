const { MongoClient } = require("mongodb")

const client = new MongoClient(process.env.MONGO_URI, { ignoreUndefined: true })
const db = client.db()
db.client = client
db.ready = false

client.connect().then(() => {
    console.log("MongoDB connected")

    db.ready = true
}).catch(err => {
    console.log("FATAL: MongoDB shat")
    console.log(err)
    exit(1) // HARD EXIT CAUSE DB IS MANDATORY
})

module.exports = db