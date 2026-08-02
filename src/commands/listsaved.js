import { listItemNames } from '../core/savedItems.js';

export default {
  name: 'listsaved',
  aliases: ['savedlist'],
  description: 'Liste les noms de tous les éléments enregistrés (via !save ou !statut).',
  category: 'Archivage',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    const names = listItemNames();
    if (!names.length) {
      await ctx.reply({ text: 'Aucun élément enregistré.' });
      return;
    }
    await ctx.reply({ text: names.map((n) => `• ${n}`).join('\n') });
  },
};
