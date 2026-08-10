import { getGroupSettings, setAntistatut } from '../core/groupSettings.js';

export default {
  name: 'antistatut',
  aliases: ['antistatus'],
  description:
    'Supprime automatiquement les notifications "X a mentionné ce groupe dans son statut". ' +
    'Usage: {prefix}antistatut on|off|status',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'status') {
      const s = getGroupSettings(ctx.chatId).antistatut;
      await ctx.reply({
        text: `📵 Antistatut : ${s.enabled ? 'activé ✅' : 'désactivé ❌'}`,
      });
      return;
    }

    if (sub !== 'on' && sub !== 'off') {
      const current = getGroupSettings(ctx.chatId).antistatut;
      await ctx.reply({
        text: `Antistatut: ${current.enabled ? 'activé ✅' : 'désactivé ❌'}\n\nUsage: !antistatut on|off`,
      });
      return;
    }

    setAntistatut(ctx.chatId, sub === 'on');
    await ctx.success(sub === 'on' ? '✅ Antistatut activé.' : '❌ Antistatut désactivé.');
  },
};
