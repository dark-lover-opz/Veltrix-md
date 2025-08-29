export default {
  name: "ping",
  description: "Check bot response",
  async execute(sock, m) {
    await sock.sendMessage(m.key.remoteJid, { text: "Pong! 🏓" });
  }
};