import { deleteItem, hasItem } from '../core/savedItems.js';

export default {
  name: 'dell',
  description: 'Supprime un élément enregistré (via !save ou !statut). Usage: !dell <nom>',
  category: 'Sauvegardes',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    const name = ctx.args[0];
    if (!name) {
      await ctx.error('Usage: !dell <nom>');
      return;
    }

    if (!hasItem(name)) {
      await ctx.error(`❌ Aucun élément trouvé sous "${name}".`);
      return;
    }

    deleteItem(name);
    await ctx.success(`🗑️ "${name}" supprimé.`);
  },
};