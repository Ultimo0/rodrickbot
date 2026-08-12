import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';
import { isDuplicateDelivery, markDelivered, parseControlDigit } from './QuizInteractionGuard.js';
import { wipeUserData, wipeAllUsersData } from './QuizEngine.js';
import { getAllStats } from './QuizStatistics.js';
import {
  renderResetConfirmation,
  renderResetDone,
  renderResetCancelled,
  renderGlobalResetConfirmation,
  renderGlobalResetDone,
  renderGlobalResetCancelled,
} from './QuizRenderer.js';

/**
 * QuizResetService
 * ----------------
 * Isole tout le flux "réinitialisation avec confirmation" : `/quiz reset`
 * (personnel) et `/quiz resetall` (global, admin) ne suppriment jamais rien
 * directement, ils ouvrent une fenêtre de confirmation (5 min) que seule une
 * réponse "1" (confirmer) ou "2" (annuler) de ce même utilisateur peut
 * consommer. La confirmation est retirée dès la première réponse valide,
 * pour qu'une redélivrance réseau ou un second "1" tardif ne puisse jamais
 * déclencher une suppression non voulue une deuxième fois.
 *
 * Les deux flux utilisent des maps distinctes (`pendingResets` /
 * `pendingGlobalResets`) : un admin qui lance /quiz reset (personnel) puis
 * /quiz resetall (global) dans la foulée a deux confirmations indépendantes,
 * jamais d'ambiguïté sur ce qu'un "1" confirme.
 *
 * `/quiz reset`/`/quiz resetall` et une session quiz active sont mutuellement
 * exclusives (imposé dans commands/quiz.js) : pas d'ambiguïté possible entre
 * "ce '1' répond à une question" et "ce '1' confirme un reset".
 */

const CONFIRMATION_TTL_MS = 5 * 60 * 1000; // 5 minutes pour confirmer
const pendingResets = new Map(); // userId -> { token, chatId, expiresAt }
const pendingGlobalResets = new Map(); // adminId -> { token, chatId, expiresAt }

function sweepExpired(map, now = Date.now()) {
  for (const [userId, pending] of map) {
    if (now > pending.expiresAt) map.delete(userId);
  }
}

/** true si cet utilisateur a une confirmation de reset personnel en attente (utilisé par messageHandler.js pour router). */
export function hasPendingReset(userId) {
  sweepExpired(pendingResets);
  return pendingResets.has(userId);
}

/** true si cet admin a une confirmation de reset GLOBAL en attente (utilisé par messageHandler.js pour router). */
export function hasPendingGlobalReset(userId) {
  sweepExpired(pendingGlobalResets);
  return pendingGlobalResets.has(userId);
}

/** /quiz reset : ouvre la fenêtre de confirmation et retourne le message à envoyer. */
export function requestReset(userId, chatId) {
  sweepExpired(pendingResets);
  const token = randomUUID(); // à des fins d'audit/logs uniquement, pas nécessaire dans la réponse utilisateur
  pendingResets.set(userId, { token, chatId, expiresAt: Date.now() + CONFIRMATION_TTL_MS });
  return renderResetConfirmation();
}

/** /quiz resetall (admin) : ouvre la fenêtre de confirmation globale et retourne le message à envoyer. */
export function requestGlobalReset(adminId, chatId) {
  sweepExpired(pendingGlobalResets);
  const token = randomUUID();
  pendingGlobalResets.set(adminId, { token, chatId, expiresAt: Date.now() + CONFIRMATION_TTL_MS });
  return renderGlobalResetConfirmation(Object.keys(getAllStats()).length);
}

/**
 * Traite une réponse texte "1"/"2" pendant qu'une confirmation de reset
 * personnel est en attente pour cet utilisateur. Ne fait rien si aucune
 * confirmation n'est en attente (le message continue alors son chemin normal).
 */
export async function handleTextReply(sock, { sender, chatId, messageId, text }) {
  const pending = pendingResets.get(sender);
  sweepExpired(pendingResets);
  if (!pending) return false;

  const digit = parseControlDigit(text);
  if (digit === null) return false; // pas "1" ni "2" : pas géré ici, laisse passer le message

  if (isDuplicateDelivery(messageId)) return true;
  markDelivered(messageId);
  pendingResets.delete(sender); // fenêtre à usage unique, retirée avant toute action

  if (digit === 2) {
    await sock.sendMessage(chatId, renderResetCancelled());
    return true;
  }

  logger.info({ sender, token: pending.token }, 'Réinitialisation quiz (personnelle) confirmée');
  wipeUserData(sender);
  await sock.sendMessage(chatId, renderResetDone());
  return true;
}

/**
 * Traite une réponse texte "1"/"2" pendant qu'une confirmation de reset
 * GLOBAL est en attente pour cet admin. Même contrat que handleTextReply :
 * retourne false (message non consommé) si rien n'est en attente ou que le
 * texte n'est pas "1"/"2".
 */
export async function handleGlobalTextReply(sock, { sender, chatId, messageId, text }) {
  const pending = pendingGlobalResets.get(sender);
  sweepExpired(pendingGlobalResets);
  if (!pending) return false;

  const digit = parseControlDigit(text);
  if (digit === null) return false;

  if (isDuplicateDelivery(messageId)) return true;
  markDelivered(messageId);
  pendingGlobalResets.delete(sender);

  if (digit === 2) {
    await sock.sendMessage(chatId, renderGlobalResetCancelled());
    return true;
  }

  logger.warn({ sender, token: pending.token }, 'Réinitialisation quiz GLOBALE confirmée par un admin');
  const result = await wipeAllUsersData(sock);
  await sock.sendMessage(chatId, renderGlobalResetDone(result));
  return true;
}
