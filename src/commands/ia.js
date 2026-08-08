import { askMistral } from '../utils/mistral.js';

export default {
  name: 'ia',
  aliases: ['ai', 'ask'],
  description: 'Pose une question à l\'IA (Mistral). Usage: {prefix}ia <question>',
  category: 'Intelligence Artificielle',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    const question = ctx.args.join(' ').trim();

    if (!question) {
      await ctx.error('Usage: !ia <ta question>\nExemple: !ia explique-moi la récursivité');
      return;
    }

    await ctx.processing();

    try {
      const answer = await askMistral(question);
      // Envoi direct (sans ctx.reply) : ctx.reply préfixe chaque ligne par
      // "> " (citation WhatsApp), illisible sur une réponse longue.
      await ctx.sock.sendMessage(ctx.chatId, { text: answer }, { quoted: ctx.msg });
      await ctx.success();
    } catch (err) {
      await ctx.error(`Impossible d'obtenir une réponse : ${err.message}`);
    }
  },
};