const SIGNABLE_PROVIDERS = []
const VERIFICATION_SPAN = 30 * 60 * 1000 // (30min) in ms
const VERIFICATION_REFRESH_AFTER = 1 * 60 * 1000 // (5min) in ms
const VERIFICATION_EMAIL_BODY = `Welcome to Tartarus,

Someone (hopefully you) requested to [reason] using this email address.

Verify using the following code:


[verification_code]


Valid for 30 minutes.
Never share this code with anyone
If you did not request this, please ignore.
Your email address won't be used unless verified.


Need help? Contact us at contact@tartarus.space

---
Kind regards,
The Tartarus System

---
This is an automated message.
Please do not reply to this email.`

const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2")
const { randomUUID } = require("crypto")
const { readFileSync } = require('fs')
const forge = require('node-forge')
const quotedPrintable = require('quoted-printable')
const utf8 = require('utf8')
const db = require("./db")

const client = new SESv2Client({
    region: process.env.AWS_REGION ?? 'me-south-1', // Bahrain
    credentials: {
        accessKeyId: process.env.SES_ACCESS_KEY_ID,
        secretAccessKey: process.env.SES_SECRET_ACCESS_KEY
    }
})

module.exports.client = client

module.exports.sendEmail = ({ to, subject, body }) => {
    return client.send(new SendEmailCommand({
        FromEmailAddress: 'Tartarus | =?UTF-8?B?2KrYp9ix2KrYp9ix2YjYsw==?= <AI@tartarus.space>',
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: subject, Body: body } }
    }))
}

if (process.env.SMIME_FULLCHAIN_PEM_PATH) {
    // Load
    const pemContent = readFileSync(process.env.SMIME_FULLCHAIN_PEM_PATH, 'utf8')

    // Extract
    const privateKeyPem = pemContent.match(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/)[0]
    const certificatePems = pemContent.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)

    // Parse
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem)
    const certificates = certificatePems.map(certPem => forge.pki.certificateFromPem(certPem))

    module.exports.createSMIMESignature = (message) => {
        const p7 = forge.pkcs7.createSignedData() // PKCS#7
        p7.content = forge.util.createBuffer(Buffer.from(message), 'utf8')

        certificates.forEach(cert => p7.addCertificate(cert))

        p7.addSigner({
            key: privateKey,
            certificate: certificates[0], // The end-entity certificate
            digestAlgorithm: forge.pki.oids.sha256,
            authenticatedAttributes: [
                { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
                { type: forge.pki.oids.messageDigest },
                { type: forge.pki.oids.signingTime, value: new Date() }
            ]
        })

        p7.sign({ detached: true })

        return forge.pkcs7.messageToPem(p7) // Convert to PEM format
    }

    module.exports.sendSignedEmail = ({ to, subject, body }) => {
        const boundary = "----=_Part_" + Date.now().toString(36)

        const content = [
            `Content-Type: text/plain; charset=UTF-8`,
            'Content-Transfer-Encoding: quoted-printable',
            '',
            // encode none ASCII and ensure CRLF as its the standard for MIME
            quotedPrintable.encode(utf8.encode(body.replace(/\r?\n/g, '\r\n'))),
            ''
        ].join('\r\n')

        const message = [
            'From: Tartarus | =?UTF-8?B?2KrYp9ix2KrYp9ix2YjYsw==?= <AI@tartarus.space>',
            'To: ' + to,
            'Subject: ' + subject,
            'MIME-Version: 1.0',
            `Content-Type: multipart/signed; protocol="application/x-pkcs7-signature"; micalg=sha-256; boundary="${boundary}"`,
            '',
            '--' + boundary,
            content,
            '--' + boundary,
            'Content-Type: application/x-pkcs7-signature; protocol="application/x-pkcs7-signature"; micalg=sha-256; smimetype=signed-data;',
            'Content-Transfer-Encoding: base64',
            'Content-Disposition: attachment; filename="smime.p7s"',
            '',
            module.exports.createSMIMESignature(content).replace(/-----BEGIN PKCS7-----|\r\n|-----END PKCS7-----/g, ''),
            '--' + boundary + '--'
        ].join('\r\n')

        return client.send(new SendEmailCommand({
            FromEmailAddress: 'Tartarus | =?UTF-8?B?2KrYp9ix2KrYp9ix2YjYsw==?= <AI@tartarus.space>',
            Destination: { ToAddresses: [to] },
            Content: { Raw: { Data: Buffer.from(message) } }
        }))
    }
}

module.exports.createVerification = async (email, reason) => {
    const token = randomUUID().slice(0, 8).toUpperCase()
    const expireDate = new Date(Date.now() + VERIFICATION_SPAN)

    try {
        const result = await db.collection('verifications').insertOne({ email, token, expireDate, reason })
        if (!result.acknowledged) throw new Error()
    } catch {
        return { errorCode: 500, error: 'MongoDB error, could not insert new verification data' }
    }
    return { token, expireDate }
}

module.exports.sendVerificationEmail = async (email, reason) => {
    let stored = await db.collection('verifications').findOne({ email, reason })
    if (stored && new Date(stored.expireDate).getTime() - VERIFICATION_SPAN + VERIFICATION_REFRESH_AFTER < Date.now()) {
        await db.collection('verifications').deleteOne(stored)
        stored = undefined
    }
    const { token } = stored ?? await this.createVerification(email, reason)

    const send = SIGNABLE_PROVIDERS.includes(email.split('@')[1]) ? this.sendSignedEmail : this.sendEmail
    try {
        const body = VERIFICATION_EMAIL_BODY
            .replace('[reason]', reason)
            .replace('[verification_code]', token.slice(0, 4) + ' ' + token.slice(4))

        await send({ to: email, subject: "Email Verification", body })
    } catch (error) {
        return {
            errorCode: error.$metadata?.httpStatusCode ?? 500,
            error: 'Failed to send verification email'
        }
    }
    return { sent: true }
}

module.exports.destroyVerification = (email, { reason, token }) => {
    db.collection('verifications').deleteOne({ email, reason, token })
}

module.exports.isValidVerification = async (email, token) => {
    const data = await db.collection('verifications').findOne({ email, token })
    return data && new Date(data.expireDate).getTime() > Date.now()
}
