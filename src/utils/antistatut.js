import { getGroupSettings } from '../core/groupSettings.js';
import { isGroup } from './helpers.js';
import { logger } from './logger.js';

/**
 * Quand un membre mentionne/tag le groupe dans son statut WhatsApp, chaque
 * membre du groupe reçoit une notification système dans le chat du type
 * "X a mentionné ce groupe dans son statut" avec un bouton pour voir le
 * statut. Contrairement aux messages classiques (texte/média), ce n'est ni
 * un `conversation`, ni un `extendedTextMessage` : Baileys expose ce type de
 * message sous un nom de champ propre au protocole WhatsApp.
 *
 * La casse exacte du nom de ce champ a varié selon les versions de Baileys
 * (`groupStatusMentionMessage`, `statusMentionMessage`, etc.). Plutôt que de
 * parier sur un seul nom figé et risquer de rater silencieusement les
 * futures versions, on détecte la notification de façon générique : toute
 * clé de `msg.message` dont le nom contient "statusmention" (insensible à
 * la casse) est traitée comme telle. Ce même esprit défensif est déjà
 * utilisé ailleurs dans le projet (voir utils/quotedContent.js et
 * commands/reveal.js face aux variations de structure des messages
 * "vue unique").
 */
function findStatusMentionKey(message) {
  if (!message) return null;
  return Object.keys(message).find((key) => key.toLowerCase().includes('statusmention')) || null;
}

export function isStatusMentionMessage(message) {
  return Boolean(findStatusMentionKey(message));
}

/**
 * @returns {Promise<boolean>} true si le message a été traité (supprimé) et
 * que le pipeline de messages doit s'arrêter là.
 */
export async function handleAntistatut(sock, msg, chatId) {
  if (!isGroup(chatId)) return false;
  if (!isStatusMentionMessage(msg.message)) return false;

  const settings = getGroupSettings(chatId);
  if (!settings.antistatut.enabled) return false;

  try {
    await sock.sendMessage(chatId, { delete: msg.key });
  } catch (err) {
    logger.warn({ err }, "Antistatut: impossible de supprimer la notification (le bot est-il admin ?)");
  }

  return true;
}
