import { defineWord } from '../utils/groq.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'define',
  aliases: ['definir', 'définir', 'dictionnaire'],
  description: "Donne la définition d'un mot ou d'une expression. Usage: {prefix}define <mot>",
  category: 'Utilitaires',
  adminOnly: false,
  cooldownMs: 10000,
  privateOnly: false,
  execute: async (ctx) => {
    const word = ctx.args.join(' ').trim();
    if (!word) {
      await ctx.error('Usage : !define <mot>\nExemple : !define éphémère');
      return;
    }

    await ctx.processing();

    try {
      const definition = await defineWord(word);
      await ctx.sock.sendMessage(ctx.chatId, { text: `📖 *${word}*\n\n${definition}` }, { quoted: ctx.msg });
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la définition');
      await ctx.error(`Impossible de trouver une définition : ${err.message}`);
    }
  },
};
