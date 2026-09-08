import { resolveInputText } from '../utils/textInput.js';
import { correctText } from '../utils/groq.js';
import { logger } from '../utils/logger.js';

const MAX_CHARS = 20000; // limite raisonnable pour rester dans la fenêtre de contexte du modèle
const MIN_CHARS = 2;

export default {
  name: 'corriger',
  aliases: ['correct', 'fix'],
  description:
    "Corrige automatiquement l'orthographe, la grammaire, la ponctuation et le style d'un texte, sans en changer le sens. Usage: {prefix}corriger <texte>, ou réponds à un message/document (.txt/.md/.csv/.json/.pdf/.docx) avec {prefix}corriger.",
  category: 'Intelligence Artificielle',
  adminOnly: false,
  cooldownMs: 15000, // appel API de correction à chaque usage
  privateOnly: false,
  execute: async (ctx) => {
    const usageMessage =
      'Usage : !corriger <texte>\n' +
      'Ou réponds à un message (ou à un document .txt/.md/.csv/.json/.pdf/.docx) avec !corriger.';

    const argsText = ctx.args.join(' ');
    const result = await resolveInputText(ctx, argsText, usageMessage);

    if (result.errorMessage) {
      await ctx.error(result.errorMessage);
      return;
    }

    let text = result.text.trim();

    if (text.length < MIN_CHARS) {
      await ctx.error('Le texte fourni est trop court pour être corrigé.');
      return;
    }

    let truncated = false;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      truncated = true;
    }

    await ctx.processing();

    try {
      const corrected = await correctText(text);
      const prefix = `✅ *Texte corrigé*${truncated ? ' — texte tronqué avant correction' : ''}\n\n`;
      // Envoi direct (sans ctx.reply) : ctx.reply préfixe chaque ligne par
      // "> " (citation WhatsApp), illisible sur un texte long.
      await ctx.sock.sendMessage(ctx.chatId, { text: prefix + corrected }, { quoted: ctx.msg });
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la correction');
      await ctx.error(`Impossible de corriger le texte : ${err.message}`);
    }
  },
};