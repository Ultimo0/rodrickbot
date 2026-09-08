import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';
import { dataFilePath } from '../utils/dataFile.js';
import { logger } from '../utils/logger.js';
import { registerShutdownHandler } from './shutdown.js';

/**
 * Statistiques d'activité par groupe/utilisateur, pour la commande
 * !activity et !inactive.
 *
 * Forme du fichier persisté (activity.json) :
 * {
 *   [chatId]: {
 *     [jid]: {
 *       total: number,
 *       daily: { "YYYY-MM-DD": number, ... },  // buckets par jour (UTC)
 *       lastActivity: number,                   // timestamp ms
 *     }
 *   }
 * }
 *
 * Comptage : incrémenté une fois par message traité par le bot dans un
 * groupe (voir handlers/messageHandler.js), tous types confondus (texte,
 * média, commandes) — pas seulement les commandes. Aucune conservation du
 * contenu des messages, uniquement des compteurs.
 *
 * Périodes ("today"/"week"/"month" vs "7d"/"30d") :
 * - today  = jour calendaire en cours
 * - week   = semaine calendaire en cours (lundi -> aujourd'hui, ISO)
 * - month  = mois calendaire en cours (1er -> aujourd'hui)
 * - Nd     = fenêtre glissante des N derniers jours (aujourd'hui inclus)
 * Ce sont deux notions différentes et volontairement distinctes : "week"/
 * "month" répondent à "où en est-on ce mois-ci", "7d"/"30d" à "qu'est-ce
 * qui s'est passé sur une fenêtre glissante" — les deux sont utiles et ne
 * se recouvrent pas exactement.
 *
 * Persistance : même stratégie que core/state.js (écriture différée,
 * flush périodique + à l'arrêt) — indispensable ici plus qu'ailleurs
 * puisque recordActivity() peut être appelé à CHAQUE message dans un
 * groupe très actif ; une écriture disque synchrone à chaque message
 * serait une régression de performance nette.
 *
 * Purge automatique : les buckets journaliers de plus de RETENTION_DAYS
 * sont supprimés au chargement et à chaque sauvegarde, pour éviter une
 * croissance indéfinie du fichier sur un bot qui tourne des mois. `total`
 * et `lastActivity`, eux, ne sont jamais purgés (ce sont des compteurs
 * cumulatifs, pas des buckets datés).
 */

const DATA_FILE = dataFilePath('activity.json');
const RETENTION_DAYS = 90;
const FLUSH_INTERVAL_MS = 30 * 1000;

let data = {};
let dirty = false;
let flushIntervalHandle = null;

function dateKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function daysAgoKey(n) {
  return dateKey(Date.now() - n * 24 * 60 * 60 * 1000);
}

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    data = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire activity.json, valeurs par défaut utilisées');
    data = {};
  }
  pruneOldBuckets();
}

function persist() {
  try {
    atomicWriteFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire activity.json");
  }
}

function scheduleSave() {
  dirty = true;
  if (!flushIntervalHandle) {
    flushIntervalHandle = setInterval(() => {
      if (dirty) {
        persist();
        dirty = false;
      }
    }, FLUSH_INTERVAL_MS);
    flushIntervalHandle.unref?.();
  }
}

function flushPendingSave() {
  if (dirty) {
    persist();
    dirty = false;
  }
}

registerShutdownHandler(flushPendingSave);

function pruneOldBuckets() {
  const cutoff = daysAgoKey(RETENTION_DAYS);
  for (const chatId of Object.keys(data)) {
    for (const jid of Object.keys(data[chatId])) {
      const entry = data[chatId][jid];
      if (!entry?.daily) continue;
      for (const day of Object.keys(entry.daily)) {
        if (day < cutoff) delete entry.daily[day];
      }
    }
  }
}

load();

function ensureEntry(chatId, jid) {
  if (!data[chatId]) data[chatId] = {};
  if (!data[chatId][jid]) {
    data[chatId][jid] = { total: 0, daily: {}, lastActivity: null };
  }
  return data[chatId][jid];
}

/**
 * Enregistre un message pour ce groupe/utilisateur. Conçue pour être
 * appelée à chaque message traité — ne doit jamais lever d'exception qui
 * remonterait jusqu'à l'appelant (voir le try/catch autour de l'appel
 * dans messageHandler.js: une erreur ici ne doit jamais empêcher le
 * traitement normal d'un message).
 */
export function recordActivity(chatId, jid) {
  const entry = ensureEntry(chatId, jid);
  const today = dateKey();
  entry.daily[today] = (entry.daily[today] || 0) + 1;
  entry.total += 1;
  entry.lastActivity = Date.now();
  scheduleSave();
}

/** Somme les buckets journaliers d'une entrée sur les N derniers jours (aujourd'hui inclus). */
function sumLastNDays(entry, n) {
  if (!entry?.daily) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += entry.daily[daysAgoKey(i)] || 0;
  }
  return sum;
}

/** Somme les buckets journaliers depuis le début du mois calendaire en cours (1er -> aujourd'hui). */
function sumCalendarMonth(entry) {
  if (!entry?.daily) return 0;
  const now = new Date();
  let sum = 0;
  for (const [day, count] of Object.entries(entry.daily)) {
    const d = new Date(`${day}T00:00:00.000Z`);
    if (d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth()) {
      sum += count;
    }
  }
  return sum;
}

/** Somme les buckets journaliers depuis le lundi de la semaine ISO en cours -> aujourd'hui. */
function sumCalendarWeek(entry) {
  if (!entry?.daily) return 0;
  const now = new Date();
  // Jour de la semaine en ISO (1 = lundi ... 7 = dimanche).
  const isoDay = (now.getUTCDay() + 6) % 7; // 0 = lundi
  let sum = 0;
  for (let i = 0; i <= isoDay; i++) {
    sum += entry.daily[daysAgoKey(i)] || 0;
  }
  return sum;
}

/**
 * Résout une clé de période en fonction générique de somme.
 * Périodes supportées: 'today', 'week', 'month', ou 'Nd' (ex: '7d', '30d').
 * Retourne null si la période n'est pas reconnue.
 */
function periodSum(entry, period) {
  if (period === 'today') return entry?.daily?.[dateKey()] || 0;
  if (period === 'week') return sumCalendarWeek(entry);
  if (period === 'month') return sumCalendarMonth(entry);

  const match = /^(\d+)d$/.exec(period);
  if (match) return sumLastNDays(entry, Number(match[1]));

  return null;
}

export function normalizePeriod(raw) {
  if (!raw) return 'today';
  const p = raw.toLowerCase();
  if (['today', 'week', 'month'].includes(p)) return p;
  if (/^\d+d$/.test(p)) return p;
  return null; // période inconnue -> l'appelant décide (erreur, ou repli)
}

/** Statistiques agrégées d'un groupe (toutes périodes utiles au résumé de !activity). */
export function getGroupSummary(chatId) {
  const group = data[chatId] || {};
  const emptyEntry = { daily: {}, total: 0 };

  let today = 0;
  let week = 0;
  let month = 0;
  let lastActivity = null;

  for (const jid of Object.keys(group)) {
    const entry = group[jid] || emptyEntry;
    today += periodSum(entry, 'today') || 0;
    week += periodSum(entry, 'week') || 0;
    month += periodSum(entry, 'month') || 0;
    if (entry.lastActivity && (!lastActivity || entry.lastActivity > lastActivity)) {
      lastActivity = entry.lastActivity;
    }
  }

  return { today, week, month, lastActivity };
}

/** Nombre de messages d'un utilisateur pour une période donnée ('today'|'week'|'month'|'Nd'). */
export function getUserPeriodCount(chatId, jid, period) {
  const entry = data[chatId]?.[jid];
  if (!entry) return 0;
  return periodSum(entry, period) || 0;
}

/** Statistiques complètes d'un utilisateur (toutes les périodes utiles au résumé individuel). */
export function getUserSummary(chatId, jid) {
  const entry = data[chatId]?.[jid];
  if (!entry) return { total: 0, today: 0, week: 0, month: 0, lastActivity: null };

  return {
    total: entry.total || 0,
    today: periodSum(entry, 'today') || 0,
    week: periodSum(entry, 'week') || 0,
    month: periodSum(entry, 'month') || 0,
    lastActivity: entry.lastActivity || null,
  };
}

/**
 * Classement des membres les plus actifs d'un groupe pour une période.
 * `period` par défaut 'total' = tout l'historique conservé (cumul, pas
 * seulement les buckets journaliers encore présents).
 */
export function getTopUsers(chatId, period = 'total', limit = 10) {
  const group = data[chatId] || {};

  const ranked = Object.entries(group)
    .map(([jid, entry]) => ({
      jid,
      count: period === 'total' ? entry.total || 0 : periodSum(entry, period) || 0,
    }))
    .filter((u) => u.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return ranked;
}

/**
 * Membres d'un groupe sans activité récente, parmi la liste des JIDs
 * actuellement présents dans le groupe (`currentJids`, fournie par
 * l'appelant via les métadonnées WhatsApp du groupe — jamais devinée ici).
 *
 * Un membre sans AUCUNE donnée d'activité connue (jamais vu écrire depuis
 * que le suivi existe) n'est PAS automatiquement considéré comme inactif :
 * on ne peut pas déterminer correctement son inactivité (il a pu rejoindre
 * avant l'ajout de cette fonctionnalité, ou juste après le dernier reset).
 * Il est renvoyé séparément (`unknown`) plutôt que classé à tort.
 */
export function getInactiveMembers(chatId, currentJids, minDays = 30) {
  const group = data[chatId] || {};
  const cutoff = Date.now() - minDays * 24 * 60 * 60 * 1000;

  const inactive = [];
  const unknown = [];

  for (const jid of currentJids) {
    const entry = group[jid];
    if (!entry || !entry.lastActivity) {
      unknown.push(jid);
    } else if (entry.lastActivity < cutoff) {
      inactive.push({ jid, lastActivity: entry.lastActivity });
    }
  }

  inactive.sort((a, b) => a.lastActivity - b.lastActivity);
  return { inactive, unknown };
}

/** Réinitialise UNIQUEMENT les statistiques d'activité d'un groupe (rien d'autre). */
export function resetGroupActivity(chatId) {
  delete data[chatId];
  scheduleSave();
}

/** Réservé aux tests : force une relecture depuis le disque (simule un redémarrage du bot). */
export function _reloadFromDiskForTests() {
  load();
}
