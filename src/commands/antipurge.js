import { getGroupSettings, setAntipurge } from '../core/groupSettings.js';

export default {
  name: 'antipurge',
  aliases: ['antiraid'],
  description:
    'Détecte un admin qui expulse plusieurs membres en très peu de temps (3 en moins de 10s) : le démet, ' +
    "l'expulse, et tente de réintégrer automatiquement les membres expulsés. Les admins du bot sont toujours exemptés. " +
    'Usage: {prefix}antipurge on|off|status',
  category: 'Modération',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'status') {
      const s = getGroupSettings(ctx.chatId).antipurge;
      await ctx.reply({
        text:
          `🚨 Antipurge : ${s.enabled ? 'activé ✅' : 'désactivé ❌'}\n` +
          'Seuil : 3 expulsions en moins de 10s\n' +
          "Sanction : rétrogradation + expulsion de l'auteur, réintégration automatique des membres expulsés",
      });
      return;
    }

    if (sub !== 'on' && sub !== 'off') {
      await ctx.error('Usage: antipurge on|off|status');
      return;
    }

    setAntipurge(ctx.chatId, sub === 'on');
    await ctx.success(sub === 'on' ? '✅ Antipurge activé.' : '❌ Antipurge désactivé.');
  },
};
