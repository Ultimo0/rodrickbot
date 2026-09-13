import { isAdmin } from '../config/index.js';
import { isMuted } from '../core/muteStore.js';
import { isGroupAdmin } from './groupMetadataCache.js';
import { isGroup } from './helpers.js';
import { logger } from './logger.js';

/**
 * Supprime tout message envoyé par un membre muet dans ce groupe.
 * Contrairement à handleAntilink/handleLinkWhitelist, s'applique à
 * N'IMPORTE QUEL type de message (texte, image, audio...), pas seulement
 * ceux contenant un lien — un "mute" doit être total.
 *
 * Un admin (bot) ou un admin du groupe ne peut jamais être réduit au
 * silence par erreur : {prefix}mute leur est de toute façon interdit
 * (voir commands/mute.js), mais cette double vérification protège aussi
 * un admin promu APRÈS avoir été muet (cas rare mais possible).
 */
export async function handleMuteGuard(sock, msg, chatId, sender) {
  if (!isGroup(chatId)) return false;
  if (!isMuted(chatId, sender)) return false;
  if (isAdmin(sender)) return false;

  try {
    if (await isGroupAdmin(sock, chatId, sender)) return false;
  } catch (err) {
    logger.warn({ err }, 'Impossible de vérifier le statut admin pour le mute');
    return false;
  }

  try {
    await sock.sendMessage(chatId, { delete: msg.key });
  } catch (err) {
    logger.warn({ err }, "Mute: impossible de supprimer le message (le bot est-il admin ?)");
  }

  return true;
}
