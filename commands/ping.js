export default {
  name: "ping",
  description: "Check bot response time",
  async execute(sock, m) {
    const sentAtMs = ((m.messageTimestamp?.low ?? m.messageTimestamp) ?? 0) * 1000
    const latency = Math.max(0, Date.now() - sentAtMs)

    const jid = m.key.remoteJid || (m.key.participant ?? "")
    try {
      await sock.presenceSubscribe(jid)
      await sock.sendPresenceUpdate("composing", jid)
      try { await sock.readMessages([m.key]) } catch {}
    } catch {}

    await sock.sendMessage(
      jid,
      { text: `Pong! Response time: ${latency} ms` },
      { quoted: m }
    )
  }
}
