import { getGroupSettings, setAntilink } from '../core/groupSettings.js';

export default {
  name: 'antilink',
  description:
    'Supprime automatiquement les liens postés par les non-admins et avertit leur auteur. Usage: !antilink on|off',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!(await ctx.requireGroup())) return;

    const sub = ctx.args[0]?.toLowerCase();

    if (sub !== 'on' && sub !== 'off') {
      const current = getGroupSettings(ctx.chatId).antilink;
      await ctx.reply({
        text: `Antilink: ${current.enabled ? 'activé ✅' : 'désactivé ❌'}\n\nUsage: !antilink on|off`,
      });
      return;
    }

    setAntilink(ctx.chatId, sub === 'on');
    await ctx.success(sub === 'on' ? '✅ Antilink activé.' : '❌ Antilink désactivé.');
  },
};