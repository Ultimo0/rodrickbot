import { findSynonyms } from '../utils/groq.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'synonyme',
  aliases: ['synonym', 'synonymes'],
  description: "Donne des synonymes d'un mot. Usage: {prefix}synonyme <mot>",
  category: 'Utilitaires',
  adminOnly: false,
  cooldownMs: 10000,
  privateOnly: false,
  execute: async (ctx) => {
    const word = ctx.args.join(' ').trim();
    if (!word) {
      await ctx.error('Usage : !synonyme <mot>\nExemple : !synonyme content');
      return;
    }

    await ctx.processing();

    try {
      const synonyms = await findSynonyms(word);
      await ctx.sock.sendMessage(ctx.chatId, { text: `🔤 *Synonymes de "${word}"*\n\n${synonyms}` }, { quoted: ctx.msg });
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la recherche de synonymes');
      await ctx.error(`Impossible de trouver des synonymes : ${err.message}`);
    }
  },
};
