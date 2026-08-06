/**
 * Sessions en attente pour les commandes de téléchargement (!tiktok,
 * !youtube) qui demandent à l'utilisateur de choisir un format
 * (audio/vidéo) avant de télécharger. Une session expire après un délai.
 * Le champ `data.type` ('tiktok' | 'youtube') indique quel téléchargeur
 * utiliser une fois le choix reçu (voir utils/downloadReply.js).
 */

import { logger } from '../utils/logger.js';

const pending = new Map();

function key(chatId, sender) {
  return `${chatId}:${sender}`;
}

/** Enregistre une session en attente et programme son expiration. */
export function setPendingChoice(chatId, sender, data, timeoutMs, onTimeout) {
  const k = key(chatId, sender);
  clearPendingChoice(chatId, sender);

  const timer = setTimeout(() => {
    pending.delete(k);
    // `onTimeout` est souvent asynchrone (envoi WhatsApp) : sans ce relais,
    // son rejet serait un rejet de promesse non géré.
    Promise.resolve()
      .then(onTimeout)
      .catch((err) => {
        logger.warn({ err, chatId, sender }, 'Erreur dans le callback d\'expiration d\'une session de téléchargement');
      });
  }, timeoutMs);

  pending.set(k, { data, timer });
}

/** Récupère la session en attente pour cet utilisateur dans ce chat, si elle existe. */
export function getPendingChoice(chatId, sender) {
  return pending.get(key(chatId, sender)) || null;
}

/** Supprime la session (choix reçu, ou expiration). */
export function clearPendingChoice(chatId, sender) {
  const k = key(chatId, sender);
  const existing = pending.get(k);
  if (existing) clearTimeout(existing.timer);
  pending.delete(k);
}