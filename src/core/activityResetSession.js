import { resetGroupActivity } from './activityStore.js';

/**
 * Confirmation avant !activity reset (admin) — même pattern que la
 * confirmation de suppression de sondage (voir core/poll/PollSessionManager.js
 * + PollManager.handleDeleteConfirmText), scopée par chatId+sender, avec
 * expiration automatique pour ne jamais laisser une confirmation traîner
 * indéfiniment.
 */

const CONFIRM_TTL_MS = 60 * 1000;
const pending = new Map(); // `${chatId}:${sender}` -> { chatId, timer }

const key = (chatId, sender) => `${chatId}:${sender}`;

export function startResetConfirmation(chatId, sender, onExpire) {
  clearResetConfirmation(chatId, sender);

  const timer = setTimeout(() => {
    pending.delete(key(chatId, sender));
    onExpire?.();
  }, CONFIRM_TTL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  pending.set(key(chatId, sender), { chatId, timer });
}

export function hasResetConfirmation(chatId, sender) {
  return pending.has(key(chatId, sender));
}

export function clearResetConfirmation(chatId, sender) {
  const k = key(chatId, sender);
  const existing = pending.get(k);
  if (existing) clearTimeout(existing.timer);
  pending.delete(k);
}

function parseYesNo(text) {
  const t = (text || '').trim().toLowerCase();
  if (['1', 'oui', 'confirmer', 'yes'].includes(t)) return true;
  if (['2', 'non', 'annuler', 'no'].includes(t)) return false;
  return null;
}

/**
 * Traite un "oui"/"non" (ou "1"/"2") alors qu'une confirmation de reset
 * est en attente pour cet utilisateur. Retourne false si aucune
 * confirmation n'est en attente ou si le texte n'est pas une réponse
 * reconnue (laisse passer le message vers le reste du pipeline).
 */
export async function handleResetConfirmText(sock, { sender, chatId, text }) {
  if (!hasResetConfirmation(chatId, sender)) return false;

  const choice = parseYesNo(text);
  if (choice === null) return false;

  clearResetConfirmation(chatId, sender);

  if (!choice) {
    await sock.sendMessage(chatId, { text: '❌ Réinitialisation annulée. Les statistiques sont intactes.' });
    return true;
  }

  resetGroupActivity(chatId);
  await sock.sendMessage(chatId, { text: '✅ Statistiques d\'activité de ce groupe réinitialisées.' });
  return true;
}
