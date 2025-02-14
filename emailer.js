const { SESv2Client, SendEmailCommand } = require("@aws-sdk/client-sesv2")

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
