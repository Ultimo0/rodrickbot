export default {
  name: 'broadcast',
  description: 'Diffuse une annonce dans le chat courant.',
  adminOnly: true,
  privateOnly: false, // doit pouvoir être utilisée en groupe
  category: 'Administration',
  execute: async (ctx) => {
    if (ctx.args.length === 0) {
      await ctx.error('Usage: !broadcast <message>');
      return;
    }
    await ctx.success(`📢 *ANNONCE*\n\n${ctx.args.join(' ')}`);
  },
};