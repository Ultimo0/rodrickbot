import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureSession,
  appendSessionMessage,
  getSession,
  getRecentMessages,
  setAgentEnabled,
  isAgentEnabled,
  clearSession,
  getSessionStats,
} from '../src/agent/sessionMemory.js';

let seq = 0;
/** Chaque test utilise un couple chat/expéditeur unique (mémoire globale au module). */
function ids() {
  seq += 1;
  return [`chat-${seq}@g.us`, `user-${seq}@s.whatsapp.net`];
}

test('ensureSession crée puis réutilise la même session', () => {
  const [chatId, sender] = ids();
  const created = ensureSession(chatId, sender);

  assert.equal(created.chatId, chatId);
  assert.equal(created.sender, sender);
  assert.deepEqual(created.messages, []);
  assert.equal(created.enabled, false);
  assert.equal(ensureSession(chatId, sender), created);
});

test('ensureSession prolonge l’expiration à chaque accès', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000 });
  const [chatId, sender] = ids();
  const session = ensureSession(chatId, sender, 60_000);
  assert.equal(session.expiresAt, 61_000);

  t.mock.timers.tick(30_000);
  assert.equal(ensureSession(chatId, sender, 60_000).expiresAt, 91_000);
  // Sans ttl explicite, le TTL par défaut (30 min) est appliqué.
  assert.equal(ensureSession(chatId, sender).expiresAt, 31_000 + 30 * 60_000);
});

test('les sessions expirées sont purgées', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const [chatId, sender] = ids();
  ensureSession(chatId, sender, 1_000);

  t.mock.timers.tick(1_001);
  assert.equal(getSession(chatId, sender), null);
});

test('appendSessionMessage empile l’historique horodaté', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 500 });
  const [chatId, sender] = ids();

  appendSessionMessage(chatId, sender, 'user', 'salut');
  const session = appendSessionMessage(chatId, sender, 'assistant', 'bonjour');

  assert.equal(session.messages.length, 2);
  assert.deepEqual(session.messages[0], { role: 'user', text: 'salut', ts: 500 });
  assert.equal(session.messages[1].role, 'assistant');
});

test('getRecentMessages ne renvoie que les derniers messages', () => {
  const [chatId, sender] = ids();
  for (let i = 1; i <= 12; i += 1) appendSessionMessage(chatId, sender, 'user', `m${i}`);

  const recent = getRecentMessages(chatId, sender);
  assert.equal(recent.length, 8);
  assert.equal(recent[0].text, 'm5');
  assert.equal(recent.at(-1).text, 'm12');
  assert.equal(getRecentMessages(chatId, sender, 2).length, 2);
});

test('getRecentMessages retourne un tableau vide sans session', () => {
  const [chatId, sender] = ids();
  assert.deepEqual(getRecentMessages(chatId, sender), []);
});

test('setAgentEnabled / isAgentEnabled basculent l’état de l’agent', () => {
  const [chatId, sender] = ids();
  assert.equal(isAgentEnabled(chatId, sender), false);

  setAgentEnabled(chatId, sender, true);
  assert.equal(isAgentEnabled(chatId, sender), true);

  setAgentEnabled(chatId, sender, 0);
  assert.equal(isAgentEnabled(chatId, sender), false);
});

test('clearSession supprime la session', () => {
  const [chatId, sender] = ids();
  appendSessionMessage(chatId, sender, 'user', 'salut');
  clearSession(chatId, sender);
  assert.equal(getSession(chatId, sender), null);
});

test('les sessions sont isolées par chat et par expéditeur', () => {
  const [chatId, sender] = ids();
  const [otherChat] = ids();

  appendSessionMessage(chatId, sender, 'user', 'a');
  appendSessionMessage(otherChat, sender, 'user', 'b');

  assert.equal(getRecentMessages(chatId, sender).at(-1).text, 'a');
  assert.equal(getRecentMessages(otherChat, sender).at(-1).text, 'b');
});

test('getSessionStats décrit les sessions actives', () => {
  const [chatId, sender] = ids();
  setAgentEnabled(chatId, sender, true);
  appendSessionMessage(chatId, sender, 'user', 'salut');

  const stats = getSessionStats();
  assert.equal(stats.count >= 1, true);
  assert.equal(stats.entries.length, stats.count);

  const entry = stats.entries.find((e) => e.chatId === chatId && e.sender === sender);
  assert.deepEqual(
    { enabled: entry.enabled, messageCount: entry.messageCount },
    { enabled: true, messageCount: 1 }
  );
  assert.equal(typeof entry.expiresAt, 'number');
});
