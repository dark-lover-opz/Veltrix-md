import { makeWASocket, useMultiFileAuthState, DisconnectReason, getContentType } from "@whiskeysockets/baileys"
import Pino from "pino"
import qrcode from "qrcode-terminal"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/** ⏱️ tiny sleep helper */
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

/** ⚡ warm up session (reduces first-contact delay) */
async function ensureSession(sock, jid, key) {
  try {
    await sock.presenceSubscribe(jid)
    await sock.sendPresenceUpdate("available", jid)
    await sock.sendPresenceUpdate("composing", jid)
    try { await sock.readMessages([key]) } catch {}
    await sleep(120) // small wait helps
  } catch {}
}

/** 📨 Fast reply helper (use inside commands) */
async function quickReply(sock, m, text) {
  return sock.sendMessage(m.key.remoteJid, { text }, { quoted: m })
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session")
  const sock = makeWASocket({
    logger: Pino({ level: "silent" }),
    printQRInTerminal: true, // (you can remove this later if using web QR)
    auth: state
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true })
    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut)
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
    commands.set(command.name, command) // { name, description, execute }
  }

  // ✅ Handle messages
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0]
    if (!m?.message) return
    if (m.key.remoteJid === "status@broadcast") return

    const text =
      m.message.conversation ??
      m.message?.extendedTextMessage?.text ??
      ""
    if (!text) return

    let cmdText = text.trim().toLowerCase()
    if (cmdText.startsWith(". ")) cmdText = "." + cmdText.slice(2)
    if (!cmdText.startsWith(".")) return

    const jid = m.key.remoteJid || (m.key.participant ?? "")

    // ⚡ Warm up session
    await ensureSession(sock, jid, m.key)

    const name = cmdText.slice(1).split(" ")[0]
    if (!commands.has(name)) return

    const command = commands.get(name)
    try {
      await command.execute(sock, m, commands, quickReply)
    } catch (err) {
      console.error("❌ Command error:", err)
      await quickReply(sock, m, "⚠️ Error running command.")
    }
  })
}

startBot()
