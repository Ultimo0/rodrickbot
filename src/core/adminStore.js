/**
 * adminStore.js
 * ------------------------------------------------------------------
 * Remplace ADMIN_JIDS (.env) par deux sources combinées :
 *
 * 1. Le PROPRIÉTAIRE : jamais stocké. C'est simplement le JID sur lequel
 *    le bot est connecté (`sock.user.id`), lu en direct sur le socket
 *    ouvert. Aucun fichier à tenir à jour, aucun risque de désync si le
 *    bot est un jour ré-appairé sur un autre numéro — la vérité vient
 *    toujours de la connexion elle-même, jamais d'une copie stockée.
 *
 * 2. Les ADMINS SUPPLÉMENTAIRES : une petite liste persistée dans
 *    `data/admins.json` (non versionné — même traitement que
 *    instance.json), modifiable via {prefix}addadmin / {prefix}removeadmin
 *    directement dans WhatsApp. Seul un admin existant peut en ajouter un
 *    autre (adminOnly: true sur ces commandes) : sans cette règle,
 *    n'importe qui pourrait s'auto-promouvoir.
 *
 * Migration : si ADMIN_JIDS existe encore dans .env au démarrage et
 * qu'admins.json n'existe pas encore, son contenu est importé une seule
 * fois dans admins.json (pour ne pas perdre les admins déjà configurés),
 * avec un avertissement invitant à retirer ADMIN_JIDS du .env.
 * ------------------------------------------------------------------
 */

import { readFileSync, existsSync } from 'fs';
import { dataFilePath } from '../utils/dataFile.js';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';
import { normalizeJid } from '../utils/groupTarget.js';

// Pas d'import de utils/logger.js ICI volontairement : logger.js importe
// config/index.js, et on veut que config/index.js puisse importer ce
// fichier (pour isAdmin/getAdmins) — l'importer en retour créerait une
// dépendance circulaire (config -> adminStore -> logger -> config) qui
// plante au démarrage avec une ReferenceError sur `config` (TDZ). console
// suffit pour les quelques logs de ce module.

const ADMINS_FILE = dataFilePath('admins.json');

let ownerJid = '';
let extraAdmins = [];

function loadAdmins() {
  if (!existsSync(ADMINS_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(ADMINS_FILE, 'utf-8'));
    if (Array.isArray(raw.extraAdmins)) {
      extraAdmins = raw.extraAdmins.map(normalizeJid).filter(Boolean);
    }
  } catch (err) {
    console.warn('[adminStore] Impossible de lire admins.json, la liste des admins supplémentaires est vide pour cette session.', err);
  }
}

function saveAdmins() {
  try {
    atomicWriteFileSync(ADMINS_FILE, JSON.stringify({ extraAdmins }, null, 2));
  } catch (err) {
    console.error("[adminStore] Impossible d'écrire admins.json", err);
  }
}

/**
 * Migration unique depuis ADMIN_JIDS (.env) : ne s'exécute que si
 * admins.json n'existe pas encore, pour ne jamais écraser une liste déjà
 * gérée via {prefix}addadmin/{prefix}removeadmin.
 */
function migrateFromEnvIfNeeded(envAdminJidsCsv) {
  if (existsSync(ADMINS_FILE)) return;

  const legacy = (envAdminJidsCsv || '')
    .split(',')
    .map((jid) => normalizeJid(jid.trim()))
    .filter(Boolean);

  if (!legacy.length) return;

  extraAdmins = [...new Set(legacy)];
  saveAdmins();
  console.warn(
    `[adminStore] Migration : ${extraAdmins.length} admin(s) importé(s) depuis ADMIN_JIDS (.env) vers admins.json. ` +
      'Tu peux maintenant retirer la ligne ADMIN_JIDS de ton .env — elle ne sera plus lue une fois cette migration faite.'
  );
}

loadAdmins();

/**
 * À appeler une fois la connexion WhatsApp ouverte (voir core/client.js),
 * avec `sock.user.id`. Le propriétaire n'est jamais persisté : il est
 * redéfini à chaque connexion, directement depuis le socket.
 */
export function setOwnerJid(jid) {
  ownerJid = normalizeJid(jid) || '';
}

export function getOwnerJid() {
  return ownerJid;
}

/** Liste complète (propriétaire + admins supplémentaires), sans doublons. */
export function getAdmins() {
  return ownerJid ? [...new Set([ownerJid, ...extraAdmins])] : [...extraAdmins];
}

export function isAdmin(jid) {
  const n = normalizeJid(jid);
  if (!n) return false;
  return n === ownerJid || extraAdmins.includes(n);
}

/** @returns {boolean} true si ajouté, false si déjà admin ou JID invalide. */
export function addAdmin(jid) {
  const n = normalizeJid(jid);
  if (!n || n === ownerJid || extraAdmins.includes(n)) return false;
  extraAdmins.push(n);
  saveAdmins();
  return true;
}

/** @returns {boolean} true si retiré, false si absent de la liste (le propriétaire ne peut pas être retiré). */
export function removeAdmin(jid) {
  const n = normalizeJid(jid);
  const idx = extraAdmins.indexOf(n);
  if (idx === -1) return false;
  extraAdmins.splice(idx, 1);
  saveAdmins();
  return true;
}

export function runEnvMigration(envAdminJidsCsv) {
  migrateFromEnvIfNeeded(envAdminJidsCsv);
}
