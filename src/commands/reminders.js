import * as RemindManager from '../core/remind/RemindManager.js';

export default {
  name: 'reminders',
  aliases: ['rappels'],
  description: 'Affiche tes rappels actifs. Usage: {prefix}reminders',
  category: 'Utilitaires',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    await ctx.reply(RemindManager.getListMessage(ctx.sender));
  },
};
