import { getEditedMessages } from '../core/deletedMessageCache.js';
import { normalizeJid } from '../utils/groupTarget.js';

function formatWhenAgo(ts) {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `il y a ${seconds}s`;
  return `il y a ${Math.round(seconds / 60)} min`;
}

export default {
  name: 'antiedit',
  aliases: ['editlog', 'seeedit'],
  description:
    'Affiche les 3 derniers messages édités dans ce chat, avec leur contenu avant/après — conservés ' +
    '45 minutes (même mécanisme que !remove pour les suppressions). Fonctionne en privé comme en groupe. ' +
    'Usage: {prefix}antiedit',
  category: 'Modération',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    const entries = getEditedMessages(ctx.chatId);

    if (!entries.length) {
      await ctx.reply({ text: "Aucune édition récente enregistrée dans ce chat (fenêtre de 45 min)." });
      return;
    }

    const mentions = [];
    const lines = entries.map((entry, i) => {
      const authorJid = entry.author ? normalizeJid(entry.author) : null;
      if (authorJid) mentions.push(authorJid);
      const authorLabel = authorJid ? `@${authorJid.split('@')[0]}` : 'inconnu';

      return (
        `*#${i + 1}* — ${authorLabel} (${formatWhenAgo(entry.editedAt)})\n` +
        `  Avant : ${entry.before}\n` +
        `  Après : ${entry.after}`
      );
    });

    await ctx.sock.sendMessage(
      ctx.chatId,
      { text: `✏️ *Messages édités récemment*\n\n${lines.join('\n\n')}`, mentions },
      { quoted: ctx.msg }
    );
  },
};
