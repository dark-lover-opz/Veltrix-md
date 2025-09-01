import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  getContentType,
  isJidUser,
  areJidsSameUser,
} from "@whiskeysockets/baileys";
import Pino from "pino";
import express from "express";
import qrcode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = express();
let sessionQR = null;

/** ⏱️ tiny sleep helper */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ⚡ warm up session (reduces first-contact delay) */
async function ensureSession(sock, jid, key) {
  try {
    await sock.presenceSubscribe(jid);
    await sock.sendPresenceUpdate("available", jid);
    await sock.sendPresenceUpdate("composing", jid);
    try {
      await sock.readMessages([key]);
    } catch {}
    await sleep(120); // small wait helps
  } catch {}
}

/** 📨 Fast reply helper (use inside commands) */
async function quickReply(sock, m, text) {
  return sock.sendMessage(m.key.remoteJid, { text }, { quoted: m });
}

// Load contacts from CSV into allowedJids
function loadContacts() {
  const raw = fs.readFileSync("./contacts.csv", "utf-8");
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Skip header if exists
  return lines
    .filter((line) => line !== "number")
    .map((num) => `${num}@s.whatsapp.net`);
}

let allowedJids = loadContacts();

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const sock = makeWASocket({
    logger: Pino({ level: "silent" }),
    printQRInTerminal: false, // (you can remove this later if using web QR)
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on(
    "connection.update",
    async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        // Generate QR code for login and log a helpful message
        sessionQR = await qrcode.toDataURL(qr);
        // sessionQR = await qrcode.toFile("test.png", qr)
        console.log("Scan the QR code at http://localhost:3001/qr to log in.");
      }
      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;
        if (shouldReconnect) startBot();
      } else if (connection === "open") {
        // Successfully connected
        console.log("✅ Veltrix Connected!");
        sessionQR = null;
      }
    }
  );

  // ✅ Load commands automatically
  const commands = new Map();
  const commandFiles = fs
    .readdirSync(path.join(__dirname, "commands"))
    .filter((f) => f.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(__dirname, "commands", file);
    const { default: command } = await import(
      `file://${filePath}?update=${Date.now()}`
    );
    commands.set(command.name, command); // { name, description, execute }
  }

  // ✅ Handle messages
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    const jid = m.key.remoteJid || (m.key.participant ?? "");
    if (!m?.message) return;

    /*
     * Only reply to direct user messages (not groups, broadcasts, newsletters, bots, etc.)
     * Allow: areJidsSameUser, isJidUser
     * Ignore: isJidMetaIa, isLidUser, isJidBroadcast, isJidGroup, isJidStatusBroadcast, isJidNewsletter, isJidBot, jidNormalizedUser
     */
    if (!isJidUser(jid)) return;

    // Only process messages from contacts
    if (!allowedJids.includes(jid)) {
      console.log("Ignoring, not in contacts:", jid);
      return;
    }

    const text =
      m.message.conversation ?? m.message?.extendedTextMessage?.text ?? "";
    if (!text) return;

    let cmdText = text.trim().toLowerCase();
    if (cmdText.startsWith(". ")) cmdText = "." + cmdText.slice(2);
    if (!cmdText.startsWith(".")) return;

    // ⚡ Warm up session
    await ensureSession(sock, jid, m.key);

    const name = cmdText.slice(1).split(" ")[0];
    if (!commands.has(name)) return;

    const command = commands.get(name);
    try {
      await command.execute(sock, m, commands, quickReply);
    } catch (err) {
      console.error("❌ Command error:", err);
      await quickReply(sock, m, "⚠️ Error running command.");
    }
  });
}

startBot();

server.get("/qr", (req, res) => {
  if (sessionQR) {
    res.send(`<img src="${sessionQR}" />`);
  } else {
    res.send("No QR available (maybe already connected?)");
  }
});

server.listen(3001, () =>
  console.log("Server running at http://localhost:3001")
);
