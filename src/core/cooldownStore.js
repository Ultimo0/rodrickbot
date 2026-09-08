/**
 * cooldownStore.js
 * ------------------------------------------------------------------
 * Cooldown par utilisateur sur les commandes qui déclarent un champ
 * `cooldownMs` (voir core/pluginLoader.js pour le format d'une commande).
 * Protège deux choses à la fois : les ressources du bot (une commande
 * !ocr/!tomp3/!tiktok relance un appel API ou un ffmpeg à chaque fois) et
 * l'expérience des autres utilisateurs (une personne qui spam une
 * commande lourde dans un groupe peut ralentir tout le monde d'autre —
 * voir la file d'attente par conversation, qui protège l'ordre des
 * envois mais pas le temps de TRAITEMENT d'une commande coûteuse).
 *
 * Volontairement en mémoire, non persisté : un cooldown n'a de sens que
 * pour la session en cours. Le perdre au redémarrage n'est jamais un
 * problème réel (au pire, la première commande après un redémarrage
 * n'est pas bridée une fois, ce qui est sans conséquence).
 *
 * Les admins du bot sont exemptés — même logique que pour antilink/
 * antiflood/antiraid : un cooldown sert à limiter un usage abusif, pas à
 * ralentir la personne qui gère le bot.
 * ------------------------------------------------------------------
 */

const lastUsedAt = new Map(); // "commandName:senderJid" -> timestamp

// Nettoyage périodique : sans ça, cette Map grossirait indéfiniment (une
// entrée par paire commande/utilisateur déjà croisée une fois) sur un bot
// qui tourne longtemps avec beaucoup d'utilisateurs différents. Aucun
// cooldown de ce bot ne dépasse quelques minutes, donc tout ce qui date de
// plus d'1h est certainement inutile à garder.
const PRUNE_INTERVAL_MS = 10 * 60 * 1000;
const PRUNE_HORIZON_MS = 60 * 60 * 1000;

setInterval(() => {
  const cutoff = Date.now() - PRUNE_HORIZON_MS;
  for (const [key, ts] of lastUsedAt) {
    if (ts < cutoff) lastUsedAt.delete(key);
  }
}, PRUNE_INTERVAL_MS).unref?.();

function buildKey(commandName, senderJid) {
  return `${commandName}:${senderJid}`;
}

/**
 * @returns {number} millisecondes restantes avant de pouvoir réutiliser
 * cette commande (0 si elle est utilisable tout de suite).
 */
export function getRemainingCooldownMs(commandName, senderJid, cooldownMs) {
  const last = lastUsedAt.get(buildKey(commandName, senderJid));
  if (!last) return 0;
  const remaining = cooldownMs - (Date.now() - last);
  return remaining > 0 ? remaining : 0;
}

export function markCommandUsed(commandName, senderJid) {
  lastUsedAt.set(buildKey(commandName, senderJid), Date.now());
}
