import { normalizeJid } from '../utils/groupTarget.js';

export default {
  name: 'tagadmin',
  aliases: ['admintag'],
  description:
    "Mentionne tous les admins du groupe, sauf le bot lui-même. Usage: {prefix}tagadmin [message] (ou en répondant à un message)",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    try {
      const metadata = await ctx.sock.groupMetadata(ctx.chatId);
      const groupAdmins = metadata.participants.filter((p) => p.admin === 'admin' || p.admin === 'superadmin');

      // Le bot est explicitement RETIRÉ des mentions, même s'il a le rôle
      // admin dans ce groupe, et même si son entrée dans `participants`
      // utilise un format de JID différent (@lid vs @s.whatsapp.net) qui
      // l'aurait fait passer entre les mailles du filtre ci-dessus.
      const botJid = normalizeJid(ctx.sock.user?.id);
      const adminJids = new Set(groupAdmins.map((a) => normalizeJid(a.id)));
      adminJids.delete(botJid);

      if (!adminJids.size) {
        await ctx.error("Aucun admin trouvé dans ce groupe.");
        return;
      }

      const quotedText = ctx.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation;
      const text = ctx.args.length ? ctx.args.join(' ') : quotedText || '📢 Attention admins';

      const mentions = [...adminJids];
      const mentionText = mentions.map((jid) => `@${jid.split('@')[0]}`).join(' ');

      await ctx.sock.sendMessage(ctx.chatId, {
        text: `${text}\n\n${mentionText}`,
        mentions,
      });
    } catch (err) {
      await ctx.error(`❌ Impossible de mentionner les admins : ${err.message}`);
    }
  },
};
