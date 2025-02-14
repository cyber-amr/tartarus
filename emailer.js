const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2")
const { readFileSync } = require('fs')
const forge = require('node-forge')
const quotedPrintable = require('quoted-printable')
const utf8 = require('utf8')

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
