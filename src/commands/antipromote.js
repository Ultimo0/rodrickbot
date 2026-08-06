import { getGroupSettings, setAntipromote } from '../core/groupSettings.js';

export default {
  name: 'antipromote',
  aliases: ['noautopromote', 'protegeradmin'],
  description:
    "Empêche les administrateurs du groupe (autres que les admins du bot) de nommer quelqu'un administrateur : " +
    "la promotion est annulée immédiatement et l'auteur est averti, jusqu'à être lui-même rétrogradé au " +
    "3e avertissement. Usage: !antipromote on|off",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const sub = ctx.args[0]?.toLowerCase();

    if (sub !== 'on' && sub !== 'off') {
      const current = getGroupSettings(ctx.chatId).antipromote;
      await ctx.reply({
        text: `Antipromote: ${current.enabled ? 'activé ✅' : 'désactivé ❌'}\n\nUsage: !antipromote on|off`,
      });
      return;
    }

    setAntipromote(ctx.chatId, sub === 'on');
    await ctx.success(sub === 'on' ? '✅ Antipromote activé.' : '❌ Antipromote désactivé.');
  },
};