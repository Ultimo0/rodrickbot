import { parseDuration, formatDuration } from '../../utils/duration.js';

/**
 * pollDuration
 * ------------
 * Le brief demande des durées en jours pour les sondages (ex: "2j"), en
 * plus de secondes/minutes/heures. `utils/duration.js` (parseDuration) est
 * DÉJÀ utilisé par !lock/!unlock/!demote/!promote et son test associé
 * (tests/duration.test.js) affirme EXPLICITEMENT que "10 jours" doit être
 * rejeté (`assert.equal(parseDuration('10 jours'), null)`). Modifier
 * utils/duration.js pour accepter les jours casserait donc ce contrat
 * existant et le test qui le vérifie — interdit par la consigne "ne casse
 * absolument aucune fonctionnalité".
 *
 * Solution : un petit parseur dédié au module Poll qui DÉLÈGUE à
 * parseDuration() pour s/min/h (réutilisation maximale, zéro duplication
 * de cette logique), et ajoute seulement les jours par-dessus, dans ce
 * fichier séparé — sans toucher au fichier partagé ni à son test.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_UNITS = ['j', 'jour', 'jours', 'd', 'day', 'days'];

export const MIN_POLL_DURATION_MS = 60 * 1000; // 1 minute : plancher raisonnable, évite un sondage clos avant que quiconque ait pu voter
export const MAX_POLL_DURATION_MS = 30 * DAY_MS; // 30 jours : plafond raisonnable, évite un sondage "éternel" par erreur de saisie (ex: 999j)

/**
 * Parse une durée de sondage ("1h", "2j", "30min", "45s"...).
 * Retourne une durée en millisecondes, ou null si l'entrée n'est pas une
 * durée valide (délégué en cas d'erreur à l'appelant : ne pas confondre
 * avec une durée refusée pour être hors bornes, voir validatePollDuration).
 */
export function parsePollDuration(input) {
  if (!input) return null;
  const trimmed = String(input).trim();

  // 1) s/min/h : délégué tel quel à la fonction déjà testée du projet.
  const viaShared = parseDuration(trimmed);
  if (viaShared !== null) return viaShared;

  // 2) jours : gérés ici uniquement (pas dans utils/duration.js, voir plus haut).
  const match = /^(\d+)\s*([a-zA-Zé]+)$/.exec(trimmed);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0 || !DAY_UNITS.includes(unit)) return null;

  return amount * DAY_MS;
}

/** true si la chaîne ressemble à une durée de sondage valide (pour distinguer "1h" d'un sous-titre/option). */
export function looksLikePollDuration(input) {
  return parsePollDuration(input) !== null;
}

/**
 * Valide une durée déjà parsée (bornes min/max). Retourne
 * { ok: true } ou { ok: false, reason: 'TOO_SHORT' | 'TOO_LONG' }.
 */
export function validatePollDuration(ms) {
  if (ms < MIN_POLL_DURATION_MS) return { ok: false, reason: 'TOO_SHORT' };
  if (ms > MAX_POLL_DURATION_MS) return { ok: false, reason: 'TOO_LONG' };
  return { ok: true };
}

/** Formate une durée de sondage pour affichage (ex: 172800000 -> "2 j"). Étend formatDuration (jours en plus), sans modifier ce dernier. */
export function formatPollDuration(ms) {
  if (ms % DAY_MS === 0 && ms >= DAY_MS) return `${ms / DAY_MS} j`;
  return formatDuration(ms);
}
