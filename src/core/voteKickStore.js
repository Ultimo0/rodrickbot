/**
 * Sessions de vote d'expulsion en cours, une par groupe maximum à la fois
 * (même principe "en mémoire, avec timeout" que core/downloadSessions.js —
 * un vote perdu au redémarrage du bot n'est pas grave, contrairement à une
 * donnée comme les warnings ou les mutes qui doivent survivre).
 */

const votes = new Map(); // chatId -> { targetJid, startedBy, voters: Set<jid>, threshold, timer }

export function getActiveVote(chatId) {
  return votes.get(chatId) || null;
}

export function startVote(chatId, { targetJid, startedBy, threshold, timeoutMs, onTimeout }) {
  const timer = setTimeout(() => {
    votes.delete(chatId);
    onTimeout();
  }, timeoutMs);

  votes.set(chatId, {
    targetJid,
    startedBy,
    threshold,
    voters: new Set([startedBy]),
    timer,
  });

  return votes.get(chatId);
}

/** Ajoute une voix. Retourne le nombre de voix actuel, ou null si aucun vote en cours. */
export function addVote(chatId, voterJid) {
  const vote = votes.get(chatId);
  if (!vote) return null;
  vote.voters.add(voterJid);
  return vote.voters.size;
}

export function clearVote(chatId) {
  const vote = votes.get(chatId);
  if (vote) clearTimeout(vote.timer);
  votes.delete(chatId);
}
