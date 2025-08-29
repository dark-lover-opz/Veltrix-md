export default {
  name: "menu",
  description: "Show all commands",
  async execute(sock, m, commands) {
    let menu = "📖 *Veltrix Menu* 📖\n\n";
    for (const [name, cmd] of commands) {
      menu += `• .${name} — ${cmd.description || "No description"}\n`;
    }
    await sock.sendMessage(m.key.remoteJid, { text: menu });
  }
};