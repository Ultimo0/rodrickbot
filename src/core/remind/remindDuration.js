/**
 * remindDuration.js
 * ------------------
 * Réutilise `core/poll/pollDuration.js` plutôt que de dupliquer une
 * troisième fois la logique de parsing "10min"/"2h"/"1j" (la première
 * étant `utils/duration.js`, la deuxième `pollDuration.js` qui y ajoute
 * les jours). `pollDuration.js` est un module pur, sans aucune dépendance
 * ni couplage au domaine "sondage" (vérifié : il n'importe que
 * `utils/duration.js`) — c'est donc un vrai utilitaire générique de
 * parsing de durée, pas une logique métier Poll, malgré son emplacement.
 *
 * Note pour une prochaine mission : ce fichier vivrait plus naturellement
 * dans `src/utils/` (partagé par construction plutôt que par un import
 * croisé entre modules `core/*`). Le renommer/déplacer maintenant
 * toucherait `core/poll/PollManager.js`, `tests/pollDuration.test.js`, etc.
 * pour un gain cosmétique — risque non justifié dans le cadre de cette
 * mission (contrainte n°1 : ne rien casser). Signalé ici plutôt que fait
 * en douce.
 */
import {
  parsePollDuration as parseFlexibleDuration,
  looksLikePollDuration as looksLikeDuration,
  formatPollDuration as formatFlexibleDuration,
} from '../poll/pollDuration.js';

export { parseFlexibleDuration, looksLikeDuration, formatFlexibleDuration };

// Limites propres à /remind (distinctes de celles de /poll, voir brief
// section 12 "les limites doivent être configurables" — même convention
// que MIN_POLL_DURATION_MS/MAX_POLL_DURATION_MS et WARN_LIMIT : une
// constante nommée et exportée, pas une valeur magique enfouie).
export const MIN_REMINDER_DURATION_MS = 10 * 1000; // 10s : en dessous, pas le temps de recevoir la confirmation avant le rappel lui-même
export const MAX_REMINDER_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // 1 an : plafond raisonnable, évite un rappel "infini" par erreur de saisie

export function validateReminderDuration(ms) {
  if (ms < MIN_REMINDER_DURATION_MS) return { ok: false, reason: 'TOO_SHORT' };
  if (ms > MAX_REMINDER_DURATION_MS) return { ok: false, reason: 'TOO_LONG' };
  return { ok: true };
}
