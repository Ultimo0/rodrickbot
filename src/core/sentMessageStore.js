/**
 * Cache en mémoire du CONTENU des messages envoyés par le bot, indexé par
 * messageId. Nécessaire pour le callback `getMessage` de makeWASocket
 * (obligatoire depuis Baileys 7.0.0, voir client.js) : Baileys en a besoin
 * pour ré-envoyer/ré-chiffrer un message déjà envoyé (retry après échec de
 * session, décompte d'un vote de sondage, message cité) — sans ce cache, il
 * ne peut que renvoyer `undefined`, ce qui est le comportement PAR DÉFAUT
 * (donc rien de cassé si ce cache est vide), mais le laisse dans les mêmes
 * conditions qu'avant sans le bénéfice attendu de 7.0.0.
 *
 * Volontairement distinct de sentMessageLog.js, qui ne garde que les CLÉS
 * (key) pour !clear — pas le contenu, qui serait inutilement lourd à
 * garder pour ce seul usage.
 */

const MAX_ENTRIES = 500;

const store = new Map(); // messageId -> content

export function recordSentContent(messageId, content) {
  if (!messageId || !content) return;
  store.set(messageId, content);
  if (store.size > MAX_ENTRIES) {
    // Map conserve l'ordre d'insertion : la première clé est la plus ancienne.
    store.delete(store.keys().next().value);
  }
}

export function getSentContent(messageId) {
  return store.get(messageId);
}
