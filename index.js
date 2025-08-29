import { makeWASocket, useMultiFileAuthState, DisconnectReason, getContentType } from "@whiskeysockets/baileys"
import Pino from "pino"
import qrcode from "qrcode-terminal"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session')
    const sock = makeWASocket({
        logger: Pino({ level: "silent" }),
        printQRInTerminal: true,
        auth: state
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
        if (qr) qrcode.generate(qr, { small: true })
        if (connection === "close") {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut)
            if (shouldReconnect) startBot()
        } else if (connection === "open") {
            console.log("✅ Veltrix Connected!")
        }
    })

    // ✅ Load commands automatically
    const commands = new Map()
    const commandFiles = fs.readdirSync(path.join(__dirname, "commands")).filter(f => f.endsWith(".js"))

    for (const file of commandFiles) {
        const filePath = path.join(__dirname, "commands", file)
        const { default: command } = await import(`file://${filePath}?update=${Date.now()}`)
        commands.set(command.name, command) // store the full object (with execute)
    }

    // ✅ Handle messages
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0]
        if (!m.message) return

        const type = getContentType(m.message)
        const text = type === "conversation"
            ? m.message.conversation
            : (type === "extendedTextMessage" ? m.message.extendedTextMessage.text : "")

        if (!text) return

        // Normalize (. ping -> .ping)
        let cmdText = text.trim().toLowerCase()
        if (cmdText.startsWith(". ")) cmdText = "." + cmdText.slice(2)

        if (cmdText.startsWith(".")) {
            const name = cmdText.slice(1).split(" ")[0]  // e.g. ".ping hello" -> "ping"
            if (commands.has(name)) {
                const command = commands.get(name)
                try {
                    await command.execute(sock, m, commands)  // ✅ call execute()
                } catch (err) {
                    console.error("❌ Command error:", err)
                    await sock.sendMessage(m.key.remoteJid, { text: "⚠️ Error running command." })
                }
            }
        }
    })
}

startBot()