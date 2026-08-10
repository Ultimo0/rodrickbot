/**
 * Mémoire de session par utilisateur WhatsApp.
 *
 * Le module garde un historique conversationnel en mémoire pour chaque
 * couple `chatId + sender`, avec une expiration automatique afin de
 * ne pas accumuler indéfiniment les messages de longue durée.
 *
 * L'API de l'agent s'appuie sur cette mémoire pour reconstruire le
 * contexte de la conversation précédente sans toucher au système de
 * commandes actuel.
 */

const DEFAULT_TTL_MS = 30 * 60 * 1000;
// Plafond dur du nombre de messages conservés par session, indépendant du
// TTL. Sans lui, un utilisateur qui enchaîne beaucoup de messages en moins
// de DEFAULT_TTL_MS fait grossir `session.messages` sans limite jusqu'à
// l'expiration de la session — alors que getRecentMessages() ne lit jamais
// que les 8 derniers (voir contextBuilder.js). Volontairement plus large
// que cette fenêtre de lecture pour laisser un peu de marge historique.
const MAX_MESSAGES_PER_SESSION = 40;
const sessions = new Map();

function buildKey(chatId, sender) {
  return `${chatId}:${sender}`;
}

function now() {
  return Date.now();
}

function pruneExpiredSessions() {
  const expiredKeys = [];
  for (const [key, session] of sessions.entries()) {
    if (session.expiresAt <= now()) {
      expiredKeys.push(key);
    }
  }
  for (const key of expiredKeys) sessions.delete(key);
}

export function ensureSession(chatId, sender, ttlMs = DEFAULT_TTL_MS) {
  pruneExpiredSessions();
  const key = buildKey(chatId, sender);
  const existing = sessions.get(key);
  if (existing) {
    existing.expiresAt = now() + ttlMs;
    return existing;
  }

  const session = {
    chatId,
    sender,
    ttlMs,
    expiresAt: now() + ttlMs,
    messages: [],
    enabled: false,
  };

  sessions.set(key, session);
  return session;
}

export function appendSessionMessage(chatId, sender, role, text) {
  const session = ensureSession(chatId, sender);
  session.messages.push({
    role,
    text,
    ts: now(),
  });
  // Borne dure : évite l'accumulation illimitée pour une session très
  // active qui ne dépasse jamais son TTL (voir MAX_MESSAGES_PER_SESSION).
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
  }
  session.expiresAt = now() + session.ttlMs;
  return session;
}

export function getSession(chatId, sender) {
  pruneExpiredSessions();
  return sessions.get(buildKey(chatId, sender)) || null;
}

export function getRecentMessages(chatId, sender, limit = 8) {
  const session = getSession(chatId, sender);
  if (!session) return [];
  return session.messages.slice(-limit);
}

export function setAgentEnabled(chatId, sender, enabled) {
  const session = ensureSession(chatId, sender);
  session.enabled = Boolean(enabled);
  session.expiresAt = now() + session.ttlMs;
  return session;
}

export function isAgentEnabled(chatId, sender) {
  const session = getSession(chatId, sender);
  return Boolean(session?.enabled);
}

export function clearSession(chatId, sender) {
  sessions.delete(buildKey(chatId, sender));
}

// Limite de débit des appels IA de l'agent (indépendante de
// middlewares/antiSpam.js, qui ne couvre que les commandes préfixées —
// l'agent s'active justement quand aucun préfixe n'est détecté, donc hors
// de son radar). Objectif : éviter qu'un utilisateur ne multiplie les
// appels Groq payants en spammant le chat en mode agent.
const AGENT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AGENT_RATE_LIMIT_MAX_CALLS = 8;

/**
 * Vérifie la limite de débit pour ce chat/utilisateur et enregistre l'appel
 * s'il est autorisé. Retourne `true` si l'appel peut continuer, `false` si
 * la limite est atteinte (dans ce cas, rien n'est enregistré en plus).
 */
export function checkAndRecordAgentCall(chatId, sender) {
  const session = ensureSession(chatId, sender);
  const cutoff = now() - AGENT_RATE_LIMIT_WINDOW_MS;
  session.callTimestamps = (session.callTimestamps || []).filter((ts) => ts > cutoff);

  if (session.callTimestamps.length >= AGENT_RATE_LIMIT_MAX_CALLS) {
    return false;
  }

  session.callTimestamps.push(now());
  return true;
}

export function getSessionStats() {
  pruneExpiredSessions();
  return {
    count: sessions.size,
    entries: [...sessions.values()].map((session) => ({
      chatId: session.chatId,
      sender: session.sender,
      enabled: session.enabled,
      messageCount: session.messages.length,
      expiresAt: session.expiresAt,
    })),
  };
}

// Nettoyage proactif pour éviter les fuites de mémoire à long terme
const PRUNE_INTERVAL_MS = 5 * 60 * 1000; // Toutes les 5 minutes
const pruneIntervalHandle = setInterval(() => {
  pruneExpiredSessions();
}, PRUNE_INTERVAL_MS);
pruneIntervalHandle.unref?.(); // ne doit pas empêcher le process de s'arrêter proprement
