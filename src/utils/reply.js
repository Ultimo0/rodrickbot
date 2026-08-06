/**
 * Helpers de réponse standardisés pour tout le bot.
 * Principe: réaction WhatsApp native (✅/❌/⏳) sur le message d'origine
 * + réponse texte sobre. Donne une identité cohérente et distincte
 * des bots qui ne font que répondre en texte brut.
 */

import { logger } from './logger.js';

const REACTIONS = {
  success: '✅',
  error: '❌',
  processing: '⏳',
};

/**
 * La réaction est purement cosmétique : si WhatsApp la refuse (message
 * trop ancien, supprimé...), on trace et on continue, sinon l'échec ferait
 * disparaître la réponse texte qui suit — en particulier le message d'erreur.
 */
async function react(sock, msg, emoji) {
  try {
    await sock.sendMessage(msg.key.remoteJid, {
      react: { text: emoji, key: msg.key },
    });
  } catch (err) {
    logger.warn({ err, chatId: msg.key.remoteJid, emoji }, 'Impossible d\'envoyer la réaction');
  }
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