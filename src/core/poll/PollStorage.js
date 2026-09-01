import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../../utils/atomicWrite.js';
import path from 'path';
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger.js';

const DATA_FILE = path.join(process.cwd(), 'polls.json');

/**
 * PollStorage
 * -----------
 * Source de vérité unique pour les sondages (créés, actifs, fermés).
 * Même format que QuizSessionManager.js / warnStore.js / groupSettings.js :
 * un objet en mémoire, rechargé au démarrage, réécrit intégralement sur
 * disque à CHAQUE mutation (sauvegarde immédiate, comme demandé dans le
 * brief). PollManager est le seul module censé appeler celui-ci —
 * ni les commandes ni messageHandler.js ne doivent lire/écrire ici
 * directement (même principe de séparation que le module Quiz).
 *
 * Un sondage :
 * {
 *   id,                 // court, lisible (6 caractères), voir generatePollId()
 *   chatId,              // groupe ou chat privé où le sondage a été créé
 *   creatorId,           // JID du créateur
 *   title,
 *   options: [{ id, text }],       // id = index stable (0, 1, 2...) sous forme de chaîne
 *   votes: { [userId]: optionId }, // un seul choix actif par utilisateur (voir "peut modifier son vote")
 *   status: 'active' | 'closed',   // 'deleted' n'existe pas : un sondage supprimé est retiré du store (voir deletePoll)
 *   messageId,            // key.id du message WhatsApp de la carte de sondage — sert à relier une réponse (reply) au bon sondage
 *   createdAt,
 *   lastActivityAt,
 *   closesAt,             // epoch ms, ou null = pas d'expiration automatique
 *   closedAt,             // epoch ms, ou null tant qu'actif
 *   closedReason,         // 'manual' | 'expired', ou null tant qu'actif
 * }
 */

let polls = {}; // { [pollId]: Poll }
let sequenceCounter = 0; // départage les sondages créés dans la même milliseconde (voir createPoll)

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    polls = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
    // Reprend la séquence après le plus grand `seq` déjà connu, pour que les
    // sondages créés après un redémarrage restent bien "après" ceux repris du
    // disque (sinon getMostRecentPollForChat pourrait à nouveau départager au
    // hasard juste après un redémarrage rapide).
    sequenceCounter = Object.values(polls).reduce((max, p) => Math.max(max, p.seq || 0), 0);
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire polls.json, aucun sondage repris');
    polls = {};
  }
}

function persist() {
  try {
    atomicWriteFileSync(DATA_FILE, JSON.stringify(polls, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire polls.json");
  }
}

load();

/** Génère un identifiant court et lisible (ex: "a3f9c1"), pas un UUID complet : l'utilisateur doit pouvoir le retaper facilement (/poll results a3f9c1). */
function generatePollId() {
  let id;
  do {
    id = randomUUID().replace(/-/g, '').slice(0, 6);
  } while (polls[id]); // collision quasi-impossible sur 6 caractères hex, mais on se protège quand même
  return id;
}

export function createPoll({ chatId, creatorId, title, options, closesAt }) {
  const id = generatePollId();
  const now = Date.now();
  sequenceCounter += 1;

  const poll = {
    id,
    seq: sequenceCounter, // ordre de création strict, y compris entre sondages créés dans la même milliseconde (voir getMostRecentPollForChat)
    chatId,
    creatorId,
    title,
    options: options.map((text, index) => ({ id: String(index), text })),
    votes: {},
    status: 'active',
    messageId: null, // renseigné juste après l'envoi du message (voir PollManager.attachMessageId)
    createdAt: now,
    lastActivityAt: now,
    closesAt: closesAt || null,
    closedAt: null,
    closedReason: null,
  };

  polls[id] = poll;
  persist();
  return poll;
}

export function getPoll(id) {
  return polls[id] || null;
}

/** Retrouve un sondage à partir du messageId de sa carte WhatsApp (utilisé pour router un vote reçu en réponse). */
export function getPollByMessageId(messageId) {
  if (!messageId) return null;
  return Object.values(polls).find((p) => p.messageId === messageId) || null;
}

/**
 * Le sondage le plus récemment créé dans ce chat (tout statut confondu),
 * utilisé quand aucun id n'est fourni. Départagé par `seq` (compteur
 * monotone), PAS par `createdAt` : deux sondages créés dans la même
 * milliseconde (Date.now() a une résolution d'1ms) auraient un `createdAt`
 * identique, rendant `p.createdAt > latest.createdAt` incapable de les
 * départager et risquant de retourner le mauvais sondage — exactement le
 * genre de "conflit entre plusieurs sondages" que le brief demande d'éviter.
 */
export function getMostRecentPollForChat(chatId) {
  const inChat = Object.values(polls).filter((p) => p.chatId === chatId);
  if (!inChat.length) return null;
  return inChat.reduce((latest, p) => (p.seq > latest.seq ? p : latest));
}

export function attachMessageId(id, messageId) {
  const poll = polls[id];
  if (!poll) return null;
  poll.messageId = messageId;
  persist();
  return poll;
}

/** Enregistre ou change le vote d'un utilisateur. Retourne le sondage mis à jour. */
export function setVote(id, userId, optionId) {
  const poll = polls[id];
  if (!poll) return null;
  poll.votes[userId] = optionId;
  poll.lastActivityAt = Date.now();
  persist();
  return poll;
}

export function closePoll(id, reason = 'manual') {
  const poll = polls[id];
  if (!poll) return null;
  poll.status = 'closed';
  poll.closedAt = Date.now();
  poll.closedReason = reason;
  persist();
  return poll;
}

export function updatePollClosesAt(id, closesAt) {
  const poll = polls[id];
  if (!poll) return null;
  poll.closesAt = closesAt;
  poll.lastActivityAt = Date.now();
  persist();
  return poll;
}

/** Supprime définitivement un sondage (voir /poll delete — confirmation gérée en amont par PollManager). */
export function deletePoll(id) {
  const existed = Boolean(polls[id]);
  delete polls[id];
  if (existed) persist();
  return existed;
}

export function listActivePollsForChat(chatId) {
  return Object.values(polls).filter((p) => p.chatId === chatId && p.status === 'active');
}

export function listAllActivePolls() {
  return Object.values(polls).filter((p) => p.status === 'active');
}

export function getExpiredActivePolls(now = Date.now()) {
  return Object.values(polls).filter((p) => p.status === 'active' && p.closesAt && p.closesAt <= now);
}

/** Usage tests/diagnostic uniquement. */
export function getAllPolls() {
  return Object.values(polls);
}
