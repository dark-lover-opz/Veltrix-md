export default {
  name: "ping",
  description: "Check bot response time",
  async execute(sock, m, commands, sendAndEcho, quickReply) {
    // timestamp from the incoming WA message (seconds -> ms)
    const sentAtMs = ((m.messageTimestamp?.low ?? m.messageTimestamp) ?? 0) * 1000;
    const latency = Math.max(0, Date.now() - sentAtMs);

    await sock.sendMessage(
      m.key.remoteJid,
      { text: `Pong! Response time: ${latency} ms` },
      { quoted: m }
    );
  }
}
