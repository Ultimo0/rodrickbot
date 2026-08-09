import { resolveInputText } from '../utils/textInput.js';
import { translateText } from '../utils/groq.js';
import { logger } from '../utils/logger.js';

const MAX_CHARS = 20000; // limite raisonnable pour rester dans la fenêtre de contexte du modèle

export default {
  name: 'traduire',
  aliases: ['translate', 'trad'],
  description:
    "Traduit un texte dans la langue demandée, en détectant automatiquement la langue d'origine. " +
    'Usage: {prefix}traduire <langue> <texte>, ou réponds à un message/document (.txt/.md/.csv/.json/.pdf/.docx) avec {prefix}traduire <langue>.',
  category: 'Intelligence Artificielle',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    const usageMessage =
      'Usage : !traduire <langue> <texte>\n' +
      'Exemples : !traduire anglais Bonjour · !traduire espagnol Salut\n' +
      "Ou réponds à un message (ou à un document .txt/.md/.csv/.json/.pdf/.docx) avec !traduire <langue>.";

    const [targetLang, ...rest] = ctx.args;

    if (!targetLang) {
      await ctx.error(usageMessage);
      return;
    }

    const argsText = rest.join(' ');
    const result = await resolveInputText(ctx, argsText, usageMessage);

    if (result.errorMessage) {
      await ctx.error(result.errorMessage);
      return;
    }

    let text = result.text.trim();

    if (!text) {
      await ctx.error(usageMessage);
      return;
    }

    let truncated = false;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS);
      truncated = true;
    }

    await ctx.processing();

    try {
      const translated = await translateText(text, targetLang);
      const prefix = `🌐 *Traduction (${targetLang})*${truncated ? ' — texte tronqué avant traduction' : ''}\n\n`;
      // Envoi direct (sans ctx.reply) : ctx.reply préfixe chaque ligne par
      // "> " (citation WhatsApp), illisible sur une traduction longue.
      await ctx.sock.sendMessage(ctx.chatId, { text: prefix + translated }, { quoted: ctx.msg });
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la traduction');
      await ctx.error(`Impossible de traduire le texte : ${err.message}`);
    }
  },
};