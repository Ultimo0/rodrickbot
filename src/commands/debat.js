import { generateDebate } from '../utils/groq.js';
import { logger } from '../utils/logger.js';

export default {
  name: 'debat',
  aliases: ['débat', 'debate'],
  description: "Développe les meilleurs arguments POUR et CONTRE un sujet. Usage: {prefix}debat <sujet>",
  category: 'Intelligence Artificielle',
  adminOnly: false,
  cooldownMs: 15000,
  privateOnly: false,
  execute: async (ctx) => {
    const topic = ctx.args.join(' ').trim();
    if (!topic) {
      await ctx.error('Usage : !debat <sujet>\nExemple : !debat le télétravail');
      return;
    }

    await ctx.processing();

    try {
      const debate = await generateDebate(topic);
      await ctx.sock.sendMessage(ctx.chatId, { text: `⚖️ *Débat : ${topic}*\n\n${debate}` }, { quoted: ctx.msg });
      await ctx.success();
    } catch (err) {
      logger.warn({ err }, 'Erreur lors de la génération du débat');
      await ctx.error(`Impossible de générer ce débat : ${err.message}`);
    }
  },
};
