import { resolveInputText } from '../utils/textInput.js';
import { translateText } from '../utils/mistral.js';
import { truncateText } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';

const MAX_CHARS = 20000; // limite raisonnable pour rester dans la fenêtre de contexte du modèle

export default {
  name: 'traduire',
  aliases: ['translate', 'trad'],
  description:
    "Traduit un texte dans la langue demandée, en détectant automatiquement la langue d'origine. " +
    'Usage: !traduire <langue> <texte>, ou réponds à un message/document (.txt/.md/.csv/.json/.pdf/.docx) avec !traduire <langue>.',
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

    const trimmed = result.text.trim();

    if (!trimmed) {
      await ctx.error(usageMessage);
      return;
    }

    const { text, truncated } = truncateText(trimmed, MAX_CHARS);

    await ctx.processing();

    try {
      const translated = await translateText(text, targetLang);
      const prefix = `🌐 *Traduction (${targetLang})*${truncated ? ' — texte tronqué avant traduction' : ''}\n\n`;
      await ctx.replyRaw({ text: prefix + translated });
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la traduction');
      await ctx.error(`Impossible de traduire le texte : ${err.message}`);
    }
  },
};