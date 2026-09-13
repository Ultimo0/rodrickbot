export default {
  name: 'lien',
  aliases: ['invitelink', 'grouplink'],
  description: "Affiche le lien d'invitation actuel du groupe.",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    try {
      const code = await ctx.sock.groupInviteCode(ctx.chatId);
      await ctx.reply({ text: `🔗 Lien d'invitation :\nhttps://chat.whatsapp.com/${code}` });
    } catch (err) {
      await ctx.error(`Impossible de récupérer le lien d'invitation : ${err.message} (le bot doit être admin du groupe).`);
    }
  },
};
