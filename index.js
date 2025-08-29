import { makeWASocket, useMultiFileAuthState, DisconnectReason,getContentType } from "@whiskeysockets/baileys"
import Pino from "pino"
import qrcode from "qrcode-terminal"

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session')
    const sock = makeWASocket({
        logger: Pino({ level: "silent" }),
        printQRInTerminal: true, // shows QR for login
        auth: state
    })

    // Save session
    sock.ev.on('creds.update', saveCreds)

    // Handle connection update
    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            qrcode.generate(qr, { small: true })
        }
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut)
            if (shouldReconnect) startBot()
        } else if (connection === "open") {
            console.log("✅ Veltrix Connected!")
        }
    })

    // Handle messages
    sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0]
    if (!m.message) return

    const type = getContentType(m.message)
    const text = type === "conversation"
        ? m.message.conversation
        : (type === "extendedTextMessage" ? m.message.extendedTextMessage.text : "")

    if (!text) return

    // ✅ Normalize
    let cmd = text.trim().toLowerCase()
    if (cmd.startsWith(". ")) {
        cmd = "." + cmd.slice(2)  // turn ". ping" → ".ping"
    }

    if (cmd === ".ping") {
        await sock.sendMessage(m.key.remoteJid, { text: "Pong! 🏓" })
    }
})
}

startBot()