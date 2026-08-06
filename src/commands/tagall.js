export default {
  name: 'tagall',
  description: 'Mentionne tous les membres du groupe sans afficher leurs numéros. Usage: !tagall [message]',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!(await ctx.requireGroup())) return;

    try {
      const metadata = await ctx.sock.groupMetadata(ctx.chatId);
      const participants = metadata.participants.map((p) => p.id);

      const text = ctx.args.length ? ctx.args.join(' ') : '📢';

      await ctx.sock.sendMessage(ctx.chatId, {
        text,
        mentions: participants,
      });

      // ✅ confirmation sur le message de commande, puis suppression pour tout le monde
      await ctx.success();
      await ctx.sock.sendMessage(ctx.chatId, { delete: ctx.msg.key });
    } catch (err) {
      await ctx.error(`❌ Impossible de mentionner tout le monde : ${err.message}`);
    }
  },
};