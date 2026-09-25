import { isAdmin } from '../config/index.js';
import { getGroupSettings } from '../core/groupSettings.js';
import { addWarn, WARN_LIMIT } from '../core/warnStore.js';
import { isGroupAdmin } from './groupMetadataCache.js';
import { extractLinkPreviewUrl, isGroup } from './helpers.js';
import { logger } from './logger.js';

const LINK_REGEX = /(https?:\/\/|www\.)\S+|chat\.whatsapp\.com\/\S+/i;

export async function handleAntilink(sock, msg, chatId, sender, text) {
  if (!isGroup(chatId)) return false;
  // Combine le texte visible avec l'URL éventuellement cachée dans l'aperçu
  // de lien enrichi (partage natif type Reel Facebook) : voir extractLinkPreviewUrl.
  const scanText = `${text || ''} ${extractLinkPreviewUrl(msg)}`.trim();
  if (!scanText || !LINK_REGEX.test(scanText)) return false;

  const settings = getGroupSettings(chatId);
  if (!settings.antilink.enabled) return false;

  if (isAdmin(sender)) return false;

  try {
    if (await isGroupAdmin(sock, chatId, sender)) return false;
  } catch (err) {
    logger.warn({ err }, 'Impossible de vérifier le statut admin pour antilink');
    return false;
  }

  try {
    await sock.sendMessage(chatId, { delete: msg.key });
  } catch (err) {
    logger.warn({ err }, "Antilink: impossible de supprimer le message (le bot est-il admin ?)");
  }

  const number = sender.split('@')[0].split(':')[0];
  const count = addWarn(chatId, sender);

  if (count >= WARN_LIMIT) {
    try {
      await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
      await sock.sendMessage(chatId, {
        text: `> 🚫 @${number} a posté un lien interdit et atteint ${WARN_LIMIT} avertissements : expulsion.`,
        mentions: [sender],
      });
    } catch (err) {
      logger.warn({ err }, 'Antilink: expulsion impossible');
    }
  } else {
    await sock.sendMessage(chatId, {
      text: `> 🔗 Lien supprimé. @${number} averti (${count}/${WARN_LIMIT}).`,
      mentions: [sender],
    });
  }

  return true;
}