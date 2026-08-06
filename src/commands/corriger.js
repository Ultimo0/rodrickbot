import { resolveInputText } from '../utils/textInput.js';
import { correctText } from '../utils/mistral.js';
import { truncateText } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';

const MAX_CHARS = 20000; // limite raisonnable pour rester dans la fenêtre de contexte du modèle
const MIN_CHARS = 2;

export default {
  name: 'corriger',
  aliases: ['correct', 'fix'],
  description:
    "Corrige automatiquement l'orthographe, la grammaire, la ponctuation et le style d'un texte, sans en changer le sens. Usage: !corriger <texte>, ou réponds à un message/document (.txt/.md/.csv/.json/.pdf/.docx) avec !corriger.",
  category: 'Intelligence Artificielle',
  adminOnly: false,
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

    const trimmed = result.text.trim();

    if (trimmed.length < MIN_CHARS) {
      await ctx.error('Le texte fourni est trop court pour être corrigé.');
      return;
    }

    const { text, truncated } = truncateText(trimmed, MAX_CHARS);

    await ctx.processing();

    try {
      const corrected = await correctText(text);
      const prefix = `✅ *Texte corrigé*${truncated ? ' — texte tronqué avant correction' : ''}\n\n`;
      await ctx.replyRaw({ text: prefix + corrected });
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la correction');
      await ctx.error(`Impossible de corriger le texte : ${err.message}`);
    }
  },
};