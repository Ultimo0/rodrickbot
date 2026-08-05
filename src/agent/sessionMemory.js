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
setInterval(() => {
  pruneExpiredSessions();
}, PRUNE_INTERVAL_MS);
