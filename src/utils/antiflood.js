import { isAdmin } from '../config/index.js';
import { getGroupSettings } from '../core/groupSettings.js';
import { addWarn, WARN_LIMIT } from '../core/warnStore.js';
import { isGroupAdmin } from './groupMetadataCache.js';
import { extractMentionedJids } from './groupTarget.js';
import { isGroup } from './helpers.js';
import { logger } from './logger.js';

/**
 * Même structure que handleAntilink (utils/antilink.js) — supprime,
 * avertit, puis expulse au bout de WARN_LIMIT — mais réagit au NOMBRE de
 * mentions dans un seul message plutôt qu'à son contenu. Cible le raid
 * classique "@membre1 @membre2 @membre3 ... @membre20" envoyé d'un coup.
 */
export async function handleAntiflood(sock, msg, chatId, sender, text) {
  if (!isGroup(chatId)) return false;

  const settings = getGroupSettings(chatId);
  if (!settings.antiflood.enabled) return false;

  const mentioned = extractMentionedJids(msg);
  if (mentioned.length <= settings.antiflood.maxMentions) return false;

  if (isAdmin(sender)) return false;

  try {
    if (await isGroupAdmin(sock, chatId, sender)) return false;
  } catch (err) {
    logger.warn({ err }, 'Impossible de vérifier le statut admin pour antiflood');
    return false;
  }

  try {
    await sock.sendMessage(chatId, { delete: msg.key });
  } catch (err) {
    logger.warn({ err }, "Antiflood: impossible de supprimer le message (le bot est-il admin ?)");
  }

  const number = sender.split('@')[0].split(':')[0];
  const count = addWarn(chatId, sender);

  if (count >= WARN_LIMIT) {
    try {
      await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
      await sock.sendMessage(chatId, {
        text: `> 🚫 @${number} a mentionné ${mentioned.length} personnes d'un coup et atteint ${WARN_LIMIT} avertissements : expulsion.`,
        mentions: [sender],
      });
    } catch (err) {
      logger.warn({ err }, 'Antiflood: expulsion impossible');
    }
  } else {
    await sock.sendMessage(chatId, {
      text: `> 📵 Message supprimé (${mentioned.length} mentions, max ${settings.antiflood.maxMentions}). @${number} averti (${count}/${WARN_LIMIT}).`,
      mentions: [sender],
    });
  }

  return true;
}
