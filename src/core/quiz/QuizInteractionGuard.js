/**
 * QuizInteractionGuard
 * ---------------------
 * Toute la logique "cette réponse est-elle légitime ?" est centralisée ici,
 * séparée du moteur de quiz : QuizEngine n'a jamais à se demander si une
 * réponse est un doublon, il reçoit uniquement des tentatives déjà validées.
 *
 * Deux protections distinctes, car deux causes différentes de doublon :
 *  1. Doublon "réseau" (Baileys peut redélivrer un événement messages.upsert
 *     après une reconnexion) -> déduplication par msg.key.id, en mémoire,
 *     fenêtre glissante courte.
 *  2. Doublon "utilisateur" (renvoi du même chiffre par erreur, ou réponse
 *     tardive après avance de la question) -> comparaison avec l'état réel
 *     de la session (currentIndex/answeredQuestionIds côté serveur, jamais
 *     fait confiance au client).
 *
 * Réponses acceptées uniquement sous forme d'un chiffre nu (voir
 * QuizRenderer) — jamais de texte libre — car WhatsApp ne rend plus les
 * messages liste/boutons de façon fiable sur les comptes personnels.
 */

const PROCESSED_MESSAGE_TTL_MS = 5 * 60 * 1000;
const processedMessageIds = new Map(); // messageId -> timestamp

function sweepProcessedIds(now = Date.now()) {
  for (const [id, ts] of processedMessageIds) {
    if (now - ts > PROCESSED_MESSAGE_TTL_MS) processedMessageIds.delete(id);
  }
}

/** true si ce messageId WhatsApp a déjà été traité (idempotence webhook). */
export function isDuplicateDelivery(messageId) {
  if (!messageId) return false;
  sweepProcessedIds();
  return processedMessageIds.has(messageId);
}

export function markDelivered(messageId) {
  if (!messageId) return;
  processedMessageIds.set(messageId, Date.now());
}

/**
 * Parse une réponse texte en numéro de réponse 1-based.
 * Retourne null si ce n'est pas un chiffre nu (ex: "2", pas "réponse 2" ni "2 ").
 * Un texte qui n'est pas un chiffre nu n'est jamais traité comme une réponse
 * quiz — c'est simplement un message normal, qui continue son chemin dans
 * le pipeline habituel.
 */
export function parseAnswerDigit(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 1 ? value : null;
}

/**
 * Valide une tentative de réponse contre l'état serveur d'une session.
 * @returns {{ ok: true }|{ ok: false, reason: string }}
 */
export function validateAnswerAttempt({ session, sender, currentQuestionId }) {
  if (!session) return { ok: false, reason: 'NO_SESSION' };
  if (session.status !== 'active') return { ok: false, reason: 'SESSION_NOT_ACTIVE' };
  if (session.userId !== sender) return { ok: false, reason: 'WRONG_USER' };
  if (!currentQuestionId) return { ok: false, reason: 'NO_CURRENT_QUESTION' };
  if ((session.answeredQuestionIds || []).includes(currentQuestionId)) {
    return { ok: false, reason: 'ALREADY_ANSWERED' }; // anti-double-envoi
  }
  return { ok: true };
}

/** Parse une réponse texte de confirmation de contrôle ("1" ou "2"). */
export function parseControlDigit(text) {
  const value = parseAnswerDigit(text);
  return value === 1 || value === 2 ? value : null;
}
