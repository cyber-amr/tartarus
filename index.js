require("dotenv").config()

const express = require("express")
const { join } = require('path')
const routes = require("./routes.js")

require("./db.js")

const app = express()
const PORT = process.env.PORT || 8080

app.set("trust proxy", true)

app.use(express.static(join(__dirname, "public"), {
    maxAge: 600000 // 10 min
}))
app.use(express.json())
app.use(routes)

app.listen(PORT, () => {
	console.log(`Listening at http://localhost:${PORT}`)
})

process.on("unhandledRejection", (r, p) => console.error(r, p))
process.on("uncaughtException", (e, o) => console.error(e, o))
process.on("uncaughtExceptionMonitor", (e, o) => console.error(e, o))
