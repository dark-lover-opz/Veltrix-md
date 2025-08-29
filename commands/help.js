export default {
  name: "help",
  description: "Show all available commands",
  async execute(sock, m, commands, quickReply) {
    let helpText = "📖 *Veltrix Help Menu* 📖\n\n"

    for (const [name, cmd] of commands) {
      helpText += `• .${name} — ${cmd.description || "No description"}\n`
    }

    await quickReply(sock, m, helpText)
  }
}
