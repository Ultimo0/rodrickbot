export default {
  name: 'hidetag',
  description: "Notifie tous les membres du groupe sans afficher la liste de mentions. Usage: !hidetag <message> (ou en répondant à un message)",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const quotedText = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation;
    const text = ctx.args.join(' ') || quotedText;

    if (!text) {
      await ctx.error('Usage: !hidetag <message> (ou en répondant à un message)');
      return;
    }

    try {
      const metadata = await ctx.sock.groupMetadata(ctx.chatId);
      const participants = metadata.participants.map((p) => p.id);

      await ctx.sock.sendMessage(ctx.chatId, {
        text,
        mentions: participants,
      });
    } catch (err) {
      await ctx.error(`❌ Impossible d'envoyer : ${err.message}`);
    }
  },
};
