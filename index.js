require("dotenv").config()

const express = require("express")
const helmet = require('helmet')
const cookieParser = require('cookie-parser')
const { join } = require('path')
const { readdirSync } = require('fs')

global.__rootdir = join(__dirname)

require("./db.js")

const app = express()
const PORT = process.env.PORT || 8080

app.set("trust proxy", true)

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com"]
        }
    }
}))

app.use(cookieParser(process.env.SECRET_COOKIE_KEY))
app.use(express.static(join(__rootdir, "public"), {
    maxAge: 600000 // 10 min
}))
app.use(express.json())

readdirSync(join(__rootdir, 'routes')).forEach(file => {
    if (file.endsWith('.js')) app.use(require(join(__rootdir, 'routes', file)))
})


const server = app.listen(PORT, () => {
    console.log(`Web server running at http://localhost:${PORT}`)
})

process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server')
    server.close(() => {
        console.log('HTTP server closed')
        process.exit(0)
    })
})

process.on("unhandledRejection", (r, p) => console.error(r, p))
process.on("uncaughtException", (e, o) => console.error(e, o))
process.on("uncaughtExceptionMonitor", (e, o) => console.error(e, o))
