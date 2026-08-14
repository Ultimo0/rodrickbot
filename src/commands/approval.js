export default {
  name: 'approval',
  aliases: ['joinapproval', 'approbation'],
  description:
    "Active ou désactive l'approbation des nouveaux membres du groupe (les demandes doivent être validées par un admin, ex: {prefix}approveall). Usage: {prefix}approval on|off",
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
      try {
        const metadata = await ctx.sock.groupMetadata(ctx.chatId);
        const current = Boolean(metadata.joinApprovalMode);
        await ctx.reply({
          text:
            `Approbation des membres : ${current ? 'activée ✅' : 'désactivée ❌'}\n\n` +
            'Usage: !approval on|off',
        });
      } catch (err) {
        await ctx.error(`❌ Impossible de lire le statut actuel : ${err.message}`);
      }
      return;
    }

    try {
      // API native WhatsApp (pas un réglage stocké côté bot, contrairement à
      // !antilink) : sock.groupJoinApprovalMode agit directement sur le
      // paramètre "Approbation des nouveaux membres" du groupe.
      await ctx.sock.groupJoinApprovalMode(ctx.chatId, sub);
      await ctx.success(
        sub === 'on'
          ? "✅ Approbation des membres activée : chaque demande d'adhésion devra être validée (voir !approveall)."
          : '❌ Approbation des membres désactivée : les demandes sont acceptées automatiquement.'
      );
    } catch (err) {
      await ctx.error(`❌ Impossible de modifier ce paramètre : ${err.message}`);
    }
  },
};
