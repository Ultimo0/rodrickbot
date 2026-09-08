import { getGroupSettings, setAntidemote } from '../core/groupSettings.js';

export default {
  name: 'antidemote',
  aliases: ['protegemoiadmin'],
  description:
    "Empêche les administrateurs du groupe (autres que les admins du bot) de retirer le statut administrateur " +
    "d'un admin du bot : la rétrogradation est annulée immédiatement (repromotion) et l'auteur est averti, " +
    "jusqu'à être lui-même rétrogradé au 3e avertissement (compteur partagé avec {prefix}antipromote). " +
    'Usage: {prefix}antidemote on|off',
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
      const current = getGroupSettings(ctx.chatId).antidemote;
      await ctx.reply({
        text: `Antidemote: ${current.enabled ? 'activé ✅' : 'désactivé ❌'}\n\nUsage: {prefix}antidemote on|off`,
      });
      return;
    }

    setAntidemote(ctx.chatId, sub === 'on');
    await ctx.success(sub === 'on' ? '✅ Antidemote activé.' : '❌ Antidemote désactivé.');
  },
};
