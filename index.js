require("dotenv").config()

const express = require("express")
const cookieParser = require('cookie-parser')
const { join } = require('path')
const routes = require("./routes.js")

require("./db.js")

const app = express()
const PORT = process.env.PORT || 8080

app.set("trust proxy", true)

app.use(cookieParser(process.env.SECRET_COOKIE_KEY))
app.use(express.static(join(__dirname, "public"), {
    maxAge: 600000 // 10 min
}))
app.use(express.json())
app.use(routes)

app.listen(PORT, () => {
	console.log(`Web server running at http://localhost:${PORT}`)
})

process.on("unhandledRejection", (r, p) => console.error(r, p))
process.on("uncaughtException", (e, o) => console.error(e, o))
process.on("uncaughtExceptionMonitor", (e, o) => console.error(e, o))
