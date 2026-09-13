export default {
  name: 'resetlien',
  aliases: ['resetinvite', 'newlink'],
  description: "Régénère le lien d'invitation du groupe (l'ancien lien devient invalide).",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    try {
      const code = await ctx.sock.groupRevokeInvite(ctx.chatId);
      await ctx.reply({
        text: `🔄 Nouveau lien d'invitation (l'ancien ne fonctionne plus) :\nhttps://chat.whatsapp.com/${code}`,
      });
    } catch (err) {
      await ctx.error(`Impossible de régénérer le lien d'invitation : ${err.message} (le bot doit être admin du groupe).`);
    }
  },
};
