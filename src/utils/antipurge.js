import { isAdmin } from '../config/index.js';
import { getGroupSettings } from '../core/groupSettings.js';
import { isBotGroupAdmin } from '../core/groupGuardian.js';
import { normalizeJid } from './groupTarget.js';
import { logger } from './logger.js';

/**
 * Antipurge : détecte un admin qui expulse plusieurs membres en très peu de
 * temps (raid/purge) et réagit — démet + expulse l'auteur, puis tente de
 * réintégrer automatiquement les membres expulsés.
 *
 * Mêmes principes que utils/antipromote.js :
 * - ADMIN_JIDS toujours exempté.
 * - Le bot lui-même est exempté (ses propres retraits — !kick, !kickall,
 *   les sanctions d'!antispam/!antipromote/!guardian — ne doivent pas se
 *   compter comme une purge).
 * - Le bot doit être admin du groupe pour pouvoir agir (démettre/expulser/
 *   réajouter) — vérifié via core/groupGuardian.js::isBotGroupAdmin.
 */

const WINDOW_MS = 10 * 1000;
const THRESHOLD = 3;

// { [chatId:jid]: [{ jid, ts }, ...] } — membres retirés récemment, par auteur
const recentRemovals = new Map();

function trackerKey(chatId, authorJid) {
  return `${chatId}:${authorJid}`;
}

function pruneOld(entries) {
  const cutoff = Date.now() - WINDOW_MS;
  while (entries.length && entries[0].ts < cutoff) entries.shift();
}

/**
 * @param {object} sock
 * @param {string} chatId
 * @param {string|undefined} author JID de la personne qui a retiré les membres
 * @param {string[]} participants JIDs des membres qui viennent d'être retirés
 */
export async function handlePurgeGuard(sock, chatId, author, participants) {
  if (!author || !participants?.length) return;

  const settings = getGroupSettings(chatId);
  if (!settings.antipurge.enabled) return;

  const normalizedAuthor = normalizeJid(author);
  const botJid = sock.user?.id ? normalizeJid(sock.user.id) : null;

  // Retrait effectué par le bot lui-même (!kick, !kickall, sanction
  // automatique d'un autre système) : jamais une purge.
  if (botJid && normalizedAuthor === botJid) return;

  // Auteur de confiance : jamais concerné.
  if (isAdmin(normalizedAuthor)) return;

  const key = trackerKey(chatId, normalizedAuthor);
  const entries = recentRemovals.get(key) || [];
  const now = Date.now();
  for (const jid of participants) entries.push({ jid: normalizeJid(jid), ts: now });
  pruneOld(entries);
  recentRemovals.set(key, entries);

  if (entries.length < THRESHOLD) return;

  // Dédoublonne (si jamais un même membre apparaît deux fois dans la fenêtre).
  const purgedJids = [...new Set(entries.map((e) => e.jid))];
  recentRemovals.delete(key);

  const authorNumber = normalizedAuthor.split('@')[0];

  if (!(await isBotGroupAdmin(sock, chatId))) {
    logger.warn({ chatId }, "Antipurge: le bot n'est pas admin, aucune action possible");
    try {
      await sock.sendMessage(chatId, {
        text:
          `🚨 Purge détectée : @${authorNumber} a expulsé ${purgedJids.length} membres en moins de ` +
          `${WINDOW_MS / 1000}s, mais je ne suis pas administrateur du groupe — je ne peux ni le sanctionner, ` +
          "ni réintégrer les membres.",
        mentions: [normalizedAuthor],
      });
    } catch (err) {
      logger.warn({ err, chatId }, "Antipurge: échec de l'envoi de l'alerte");
    }
    return;
  }

  // --- 1) Démettre puis expulser l'auteur ---
  try {
    await sock.groupParticipantsUpdate(chatId, [normalizedAuthor], 'demote');
  } catch (err) {
    logger.debug({ err, chatId }, "Antipurge: échec de la rétrogradation de l'auteur (n'était peut-être pas admin)");
  }

  let authorKicked = false;
  try {
    await sock.groupParticipantsUpdate(chatId, [normalizedAuthor], 'remove');
    authorKicked = true;
  } catch (err) {
    logger.warn({ err, chatId }, "Antipurge: échec de l'expulsion de l'auteur");
  }

  // --- 2) Tenter de réintégrer les membres expulsés ---
  let addResults = [];
  try {
    addResults = await sock.groupParticipantsUpdate(chatId, purgedJids, 'add');
  } catch (err) {
    logger.warn({ err, chatId }, 'Antipurge: échec de la tentative de réintégration');
  }

  const succeeded = (addResults || [])
    .filter((r) => String(r.status) === '200')
    .map((r) => normalizeJid(r.jid));
  const failed = purgedJids.filter((jid) => !succeeded.includes(jid));

  // --- 3) Notifier le groupe ---
  const lines = [
    `🚨 Purge détectée : @${authorNumber} a expulsé ${purgedJids.length} membres en moins de ${WINDOW_MS / 1000}s.`,
    authorKicked
      ? '🚫 Il a été démis puis expulsé du groupe.'
      : "⚠️ Il a été démis, mais je n'ai pas pu l'expulser.",
  ];
  if (succeeded.length) {
    lines.push(`♻️ ${succeeded.length}/${purgedJids.length} membre(s) réintégré(s) automatiquement.`);
  }
  if (failed.length) {
    lines.push(
      `❌ ${failed.length} membre(s) n'ont pas pu être réintégrés (probablement leurs réglages de ` +
        'confidentialité empêchant un ajout direct) — invite-les manuellement si besoin.'
    );
  }

  try {
    await sock.sendMessage(chatId, {
      text: lines.join('\n'),
      mentions: [normalizedAuthor, ...succeeded],
    });
  } catch (err) {
    logger.warn({ err, chatId }, "Antipurge: échec de l'envoi de la notification finale");
  }
}
