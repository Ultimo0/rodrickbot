import { askMistral } from '../utils/mistral.js';

export default {
  name: 'ia',
  aliases: ['ai', 'ask'],
  description: 'Pose une question à l\'IA (Mistral). Usage: !ia <question>',
  category: 'Utilitaires',
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
      await ctx.reply({ text: answer });
      await ctx.success();
    } catch (err) {
      await ctx.error(`Impossible d'obtenir une réponse : ${err.message}`);
    }
  },
};