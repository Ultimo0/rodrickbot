import { getGroupSettings } from './groupSettings.js';
import { isBotGroupAdmin } from './groupGuardian.js';
import { scheduleAutoAction } from './lockScheduler.js';
import { normalizeJid } from '../utils/groupTarget.js';
import { logger } from '../utils/logger.js';

/**
 * Antiraid (volet "affluence") : un afflux anormal de nouveaux membres en
 * peu de temps est un signe avant-coureur courant d'un raid coordonné
 * (avant que du spam/contenu à risque ne soit posté en masse). Réagir tôt
 * ici — verrouiller le groupe préventivement — vaut mieux que réagir après
 * coup une fois le contenu déjà posté.
 *
 * Même principe de fenêtre glissante que utils/antipurge.js, mais compte
 * les AJOUTS (peu importe qui les a faits — un raid peut venir de
 * plusieurs comptes différents qui rejoignent via un lien d'invitation,
 * pas forcément d'un seul auteur qui ajoute) plutôt que les retraits par
 * un même auteur.
 */

const WINDOW_MS = 60 * 1000; // 1 min
const THRESHOLD = 8; // membres

const AUTO_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 min, déverrouillage automatique ensuite

// { [chatId]: [{ jid, ts }, ...] }
const recentJoins = new Map();

function pruneOld(entries) {
  const cutoff = Date.now() - WINDOW_MS;
  while (entries.length && entries[0].ts < cutoff) entries.shift();
}

/**
 * @param {object} sock
 * @param {string} chatId
 * @param {string[]} participants JIDs des membres qui viennent de rejoindre
 */
export async function handleJoinRaidGuard(sock, chatId, participants) {
  if (!participants?.length) return;

  const settings = getGroupSettings(chatId);
  if (!settings.antiraid.enabled) return;

  const entries = recentJoins.get(chatId) || [];
  const now = Date.now();
  for (const jid of participants) entries.push({ jid: normalizeJid(jid), ts: now });
  pruneOld(entries);
  recentJoins.set(chatId, entries);

  if (entries.length < THRESHOLD) return;

  recentJoins.delete(chatId); // évite de redéclencher en boucle sur les mêmes entrées

  if (!(await isBotGroupAdmin(sock, chatId))) {
    logger.warn({ chatId }, "Antiraid: afflux détecté mais le bot n'est pas admin, verrouillage impossible");
    try {
      await sock.sendMessage(chatId, {
        text:
          `🚨 Afflux anormal détecté : ${entries.length} membres ont rejoint en moins de ` +
          `${WINDOW_MS / 1000}s, mais je ne suis pas administrateur du groupe — je ne peux pas le verrouiller.`,
      });
    } catch (err) {
      logger.warn({ err, chatId }, "Antiraid: échec de l'envoi de l'alerte");
    }
    return;
  }

  try {
    await sock.groupSettingUpdate(chatId, 'announcement');
    await sock.sendMessage(chatId, {
      text:
        `🚨 Afflux anormal détecté : ${entries.length} membres ont rejoint en moins de ${WINDOW_MS / 1000}s.\n` +
        `🔒 Groupe verrouillé préventivement (seuls les admins peuvent écrire) pendant ${AUTO_LOCK_DURATION_MS / 60000} min.`,
    });
    scheduleAutoAction(sock, chatId, 'unlock', AUTO_LOCK_DURATION_MS);
  } catch (err) {
    logger.warn({ err, chatId }, 'Antiraid: échec du verrouillage automatique');
  }
}
