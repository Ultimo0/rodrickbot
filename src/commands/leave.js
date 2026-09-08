export default {
  name: 'leave',
  aliases: ['quitter', 'quittergroupe'],
  description:
    'Fait quitter le bot de ce groupe, sans toucher aux membres (voir {prefix}delgroup pour vider le groupe avant de partir). ' +
    'Usage: {prefix}leave',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const senderJid = ctx.sender;
    const groupName = (await ctx.sock.groupMetadata(ctx.chatId).catch(() => null))?.subject || ctx.chatId;

    try {
      // Confirmation envoyée en PRIVÉ à celui qui a lancé la commande :
      // une fois le groupe quitté, le bot ne peut plus y écrire quoi que
      // ce soit (même logique que {prefix}delgroup).
      await ctx.sock.groupLeave(ctx.chatId);
      await ctx.sock.sendMessage(senderJid, { text: `✅ J'ai quitté le groupe "${groupName}".` }).catch(() => {});
    } catch (err) {
      await ctx.error(`❌ Impossible de quitter le groupe : ${err.message}`);
    }
  },
};
