/**
 * Helpers de réponse standardisés pour tout le bot.
 * Principe: réaction WhatsApp native (✅/❌/⏳) sur le message d'origine
 * + réponse texte sobre. Donne une identité cohérente et distincte
 * des bots qui ne font que répondre en texte brut.
 */

const REACTIONS = {
  success: '✅',
  error: '❌',
  processing: '⏳',
};

async function react(sock, msg, emoji) {
  await sock.sendMessage(msg.key.remoteJid, {
    react: { text: emoji, key: msg.key },
  });
}

/**
 * Attache les helpers au contexte de commande.
 * ctx.success(text?)   -> réaction ✅ + réponse texte optionnelle
 * ctx.error(text?)     -> réaction ❌ + réponse texte optionnelle
 * ctx.processing()     -> réaction ⏳ (accusé de réception, traitement en cours)
 */
export function attachReplyHelpers(ctx) {
  ctx.success = async (text) => {
    await react(ctx.sock, ctx.msg, REACTIONS.success);
    if (text) await ctx.reply({ text });
  };

  ctx.error = async (text) => {
    await react(ctx.sock, ctx.msg, REACTIONS.error);
    if (text) await ctx.reply({ text });
  };

  ctx.processing = () => react(ctx.sock, ctx.msg, REACTIONS.processing);
}