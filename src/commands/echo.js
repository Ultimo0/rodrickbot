export default {
  name: 'echo',
  description: 'Répète le texte fourni. Exemple: !echo bonjour le monde',
  category: 'Utilitaires',
  execute: async (ctx) => {
    if (ctx.args.length === 0) {
      await ctx.error('Usage: !echo <texte à répéter>');
      return;
    }
    await ctx.success(ctx.args.join(' '));
  },
};