/**
 * CalcInteractionGuard
 * ---------------------
 * Même principe que QuizInteractionGuard (déduplication réseau par
 * messageId), avec un parsing différent : la réponse au calcul mental est
 * un nombre entier libre — positif, négatif, ou zéro — pas un choix parmi
 * des options numérotées. `-12` est une réponse valide, contrairement au
 * quiz où seul 1..N (nombre d'options) est accepté.
 */

const PROCESSED_MESSAGE_TTL_MS = 5 * 60 * 1000;
const processedMessageIds = new Map(); // messageId -> timestamp

function sweepProcessedIds(now = Date.now()) {
  for (const [id, ts] of processedMessageIds) {
    if (now - ts > PROCESSED_MESSAGE_TTL_MS) processedMessageIds.delete(id);
  }
}

export function isDuplicateDelivery(messageId) {
  if (!messageId) return false;
  sweepProcessedIds();
  return processedMessageIds.has(messageId);
}

export function markDelivered(messageId) {
  if (!messageId) return;
  processedMessageIds.set(messageId, Date.now());
}

/** Parse un entier signé nu ("-12", "0", "47") ; null si le texte n'en est pas un. */
export function parseAnswerNumber(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}
