import { readFileSync } from 'fs';
import path from 'path';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { getDeletedMessages } from '../core/deletedMessageCache.js';
import { getMediaType, getMediaObject, getTextContent } from '../utils/quotedContent.js';
import { getCurrentTheme } from '../themes/engine.js';
import { config } from '../config/index.js';
import { normalizeJid } from '../utils/groupTarget.js';
import { logger } from '../utils/logger.js';

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));

const TYPE_ICONS = { text: '📝', image: '🖼', video: '🎬', audio: '🎵' };
const TYPE_LABELS = { text: 'Texte', image: 'Image', video: 'Vidéo', audio: 'Audio' };

function formatWhenAgo(ts) {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return `il y a ${seconds}s`;
  return `il y a ${Math.round(seconds / 60)} min`;
}

export default {
  name: 'remove',
  aliases: ['antidelete', 'recovermsg'],
  description:
    'Renvoie les 3 derniers messages supprimés dans ce chat (texte, image, vidéo, audio) — conservés ' +
    '45 minutes. Fonctionne en privé comme en groupe. Usage: {prefix}remove',
  category: 'Modération',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    const rawEntries = getDeletedMessages(ctx.chatId);
    const theme = getCurrentTheme();

    const entries = rawEntries.map((entry, i) => {
      const mediaType = getMediaType(entry.msg.message);
      const type = mediaType || 'text';
      const authorJid = entry.author ? normalizeJid(entry.author) : null;
      return {
        index: i + 1,
        icon: TYPE_ICONS[type] || '📎',
        typeLabel: TYPE_LABELS[type] || type,
        authorLabel: authorJid ? `@${authorJid.split('@')[0]}` : 'inconnu',
        whenLabel: formatWhenAgo(entry.deletedAt),
        textContent: mediaType ? null : getTextContent(entry.msg.message),
        _raw: entry,
        _mediaType: mediaType,
        _authorJid: authorJid,
      };
    });

    const summary = theme.renderDeletedMessages({
      entries: entries.map(({ _raw, _mediaType, _authorJid, ...rest }) => rest),
      footer: { version: pkg.version, prefix: config.prefix, developerName: config.developerName },
    });

    const mentions = entries.map((e) => e._authorJid).filter(Boolean);
    await ctx.sock.sendMessage(ctx.chatId, { text: summary, mentions }, { quoted: ctx.msg });

    // Le texte est déjà inclus dans le résumé ci-dessus ; seuls les médias
    // doivent être renvoyés séparément (impossible d'attacher un média à
    // l'intérieur d'un simple message texte WhatsApp).
    for (const e of entries) {
      if (!e._mediaType) continue;

      try {
        const buffer = await downloadMediaMessage(e._raw.msg, 'buffer', {}, {
          logger,
          reuploadRequest: ctx.sock.updateMediaMessage,
        });
        const mediaObj = getMediaObject(e._raw.msg.message, e._mediaType);
        const sendOptions = {};

        if (e._mediaType === 'image') {
          sendOptions.image = buffer;
          sendOptions.caption = `🗑 Média supprimé #${e.index}`;
        } else if (e._mediaType === 'video') {
          sendOptions.video = buffer;
          sendOptions.caption = `🗑 Média supprimé #${e.index}`;
        } else if (e._mediaType === 'audio') {
          sendOptions.audio = buffer;
          sendOptions.mimetype = mediaObj?.mimetype || 'audio/ogg; codecs=opus';
        }

        await ctx.sock.sendMessage(ctx.chatId, sendOptions, { quoted: ctx.msg });
      } catch (err) {
        logger.warn({ err }, `remove: échec de récupération du média #${e.index}`);
        await ctx.sock.sendMessage(ctx.chatId, {
          text: `⚠️ Impossible de récupérer le média #${e.index} (probablement expiré côté WhatsApp).`,
        });
      }
    }
  },
};
