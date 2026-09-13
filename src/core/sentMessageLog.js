/**
 * Historique volatile (en mémoire, non persistant — perdu au redémarrage,
 * ce qui est sans conséquence : !clear ne sert qu'à nettoyer les messages
 * récents encore visibles à l'écran) des clés des derniers messages
 * envoyés par le bot, par chatId. Alimenté depuis core/outboundGateway.js
 * (qui voit passer TOUS les envois, quelle que soit la commande à
 * l'origine), consommé par commands/clear.js.
 */

const MAX_PER_CHAT = 200;

const log = new Map(); // chatId -> [key, ...] (du plus ancien au plus récent)

export function recordSentMessage(chatId, key) {
  if (!key) return;
  const list = log.get(chatId) || [];
  list.push(key);
  if (list.length > MAX_PER_CHAT) list.shift();
  log.set(chatId, list);
}

/** Renvoie les `count` messages les plus récents envoyés dans ce chat (du plus récent au plus ancien). */
export function getRecentSentKeys(chatId, count) {
  const list = log.get(chatId) || [];
  return list.slice(-count).reverse();
}

export function removeSentKeys(chatId, keys) {
  const ids = new Set(keys.map((k) => k.id));
  const list = log.get(chatId) || [];
  log.set(chatId, list.filter((k) => !ids.has(k.id)));
}
