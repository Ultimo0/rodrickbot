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
 * Double identité PN/LID : WhatsApp peut rapporter la même personne sous
 * deux formes différentes (JID "PN" classique @s.whatsapp.net, ou JID
 * "LID" @lid) selon le contexte de l'événement. Le propriétaire ET les
 * admins supplémentaires sont donc stockés comme un ENSEMBLE de formes
 * connues (voir ownerJidForms et extraAdmins[].forms) plutôt qu'une seule
 * chaîne figée — sinon isAdmin() peut renvoyer un faux négatif silencieux
 * selon la forme sous laquelle WhatsApp rapporte l'auteur d'une action
 * (bug confirmé en prod pour le propriétaire, corrigé en 1.76.0, étendu
 * ici aux admins supplémentaires).
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
import { normalizeJid, getBotSelfIds } from '../utils/groupTarget.js';

// Pas d'import de utils/logger.js ICI volontairement : logger.js importe
// config/index.js, et on veut que config/index.js puisse importer ce
// fichier (pour isAdmin/getAdmins) — l'importer en retour créerait une
// dépendance circulaire (config -> adminStore -> logger -> config) qui
// plante au démarrage avec une ReferenceError sur `config` (TDZ). console
// suffit pour les quelques logs de ce module.

const ADMINS_FILE = dataFilePath('admins.json');

let ownerJid = '';
// Le propriétaire EST le compte sur lequel le bot est connecté : il a donc
// exactement le même problème de double identité que getBotSelfIds()
// résout déjà pour reconnaître le bot lui-même (voir utils/groupTarget.js).
let ownerJidForms = new Set();

// Chaque admin supplémentaire est { forms: string[] } — toutes les formes
// connues (PN + LID quand disponible) pour cette même personne, plutôt
// qu'une seule chaîne. Rétrocompatible avec les admins.json créés avant ce
// correctif (voir loadAdmins ci-dessous).
let extraAdmins = [];

function loadAdmins() {
  if (!existsSync(ADMINS_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(ADMINS_FILE, 'utf-8'));
    if (Array.isArray(raw.extraAdmins)) {
      extraAdmins = raw.extraAdmins
        .map((entry) => {
          // Rétrocompatibilité : les admins.json créés avant ce correctif
          // stockent une simple chaîne par admin (une seule forme connue).
          // On l'enveloppe dans la même structure { forms: [...] } que les
          // nouvelles entrées, sans rien perdre.
          const rawForms = typeof entry === 'string' ? [entry] : entry?.forms;
          const forms = [...new Set((rawForms || []).map(normalizeJid).filter(Boolean))];
          return forms.length ? { forms } : null;
        })
        .filter(Boolean);
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
 * gérée via {prefix}addadmin/{prefix}removeadmin. Une seule forme connue
 * par admin importé (celle du .env) — la seconde forme (LID/PN), si elle
 * existe, sera apprise plus tard si cette personne est re-ajoutée via
 * {prefix}addadmin depuis un groupe.
 */
function migrateFromEnvIfNeeded(envAdminJidsCsv) {
  if (existsSync(ADMINS_FILE)) return;

  const legacy = (envAdminJidsCsv || '')
    .split(',')
    .map((jid) => normalizeJid(jid.trim()))
    .filter(Boolean);

  if (!legacy.length) return;

  extraAdmins = [...new Set(legacy)].map((jid) => ({ forms: [jid] }));
  saveAdmins();
  console.warn(
    `[adminStore] Migration : ${extraAdmins.length} admin(s) importé(s) depuis ADMIN_JIDS (.env) vers admins.json. ` +
      'Tu peux maintenant retirer la ligne ADMIN_JIDS de ton .env — elle ne sera plus lue une fois cette migration faite.'
  );
}

loadAdmins();

/**
 * À appeler une fois la connexion WhatsApp ouverte (voir core/client.js),
 * avec `sock` entier (pas juste sock.user?.id) : nécessaire pour capturer
 * aussi la forme @lid du propriétaire via getBotSelfIds(), pas seulement
 * sa forme @s.whatsapp.net. `ownerJid` (forme canonique unique) reste
 * inchangé pour l'affichage et les comparaisons existantes
 * (addadmin/removeadmin/admins) ; `ownerJidForms` (ensemble complet) est
 * ce que isAdmin()/isOwner() vérifient réellement.
 */
export function setOwnerJid(sock) {
  ownerJid = normalizeJid(sock?.user?.id) || '';
  ownerJidForms = getBotSelfIds(sock);
  if (ownerJid) ownerJidForms.add(ownerJid);
}

export function getOwnerJid() {
  return ownerJid;
}

/** true si `jid` (sous n'importe laquelle de ses formes connues) est le propriétaire du bot. */
export function isOwner(jid) {
  const n = normalizeJid(jid);
  return Boolean(n) && ownerJidForms.has(n);
}

/** Liste complète (propriétaire + admins supplémentaires), une forme canonique par personne, sans doublons. */
export function getAdmins() {
  const extraCanonical = extraAdmins.map((admin) => admin.forms[0]).filter(Boolean);
  return ownerJid ? [...new Set([ownerJid, ...extraCanonical])] : [...new Set(extraCanonical)];
}

export function isAdmin(jid) {
  const n = normalizeJid(jid);
  if (!n) return false;
  if (ownerJidForms.has(n)) return true;
  return extraAdmins.some((admin) => admin.forms.includes(n));
}

/**
 * @param {string[]} forms Toutes les formes connues (PN + LID si dispo) de
 *   la personne à ajouter — voir resolveParticipantForms() dans
 *   utils/groupTarget.js, utilisé par {prefix}addadmin pour les récupérer.
 * @returns {boolean} true si ajouté, false si déjà admin (sous n'importe
 *   laquelle de ses formes) ou si aucune forme valide n'a été fournie.
 */
export function addAdmin(forms) {
  const normalized = [...new Set((Array.isArray(forms) ? forms : [forms]).map(normalizeJid).filter(Boolean))];
  if (!normalized.length) return false;
  if (normalized.some((n) => ownerJidForms.has(n))) return false;
  if (normalized.some((n) => extraAdmins.some((admin) => admin.forms.includes(n)))) return false;

  extraAdmins.push({ forms: normalized });
  saveAdmins();
  return true;
}

/** @returns {boolean} true si retiré, false si absent de la liste (le propriétaire ne peut pas être retiré). */
export function removeAdmin(jid) {
  const n = normalizeJid(jid);
  if (!n) return false;
  const idx = extraAdmins.findIndex((admin) => admin.forms.includes(n));
  if (idx === -1) return false;
  extraAdmins.splice(idx, 1);
  saveAdmins();
  return true;
}

export function runEnvMigration(envAdminJidsCsv) {
  migrateFromEnvIfNeeded(envAdminJidsCsv);
}
