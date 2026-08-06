import test from 'node:test';
import assert from 'node:assert/strict';

import { buildConversationContext } from '../src/agent/contextBuilder.js';
import { appendSessionMessage, clearSession } from '../src/agent/sessionMemory.js';

let seq = 0;
function ids() {
  seq += 1;
  return [`ctx-chat-${seq}@g.us`, `ctx-user-${seq}@s.whatsapp.net`];
}

test('sans historique, le prompt le signale explicitement', () => {
  const [chatId, sender] = ids();
  const ctx = buildConversationContext(chatId, sender, 'Bonjour');

  assert.equal(ctx.history, '');
  assert.equal(ctx.latestUserText, 'Bonjour');
  assert.match(ctx.prompt, /Historique récent: aucun\./);
  assert.match(ctx.prompt, /Dernier message utilisateur:\nBonjour/);
});

test('l’historique est étiqueté par rôle', () => {
  const [chatId, sender] = ids();
  appendSessionMessage(chatId, sender, 'user', 'Quelle heure est-il ?');
  appendSessionMessage(chatId, sender, 'assistant', 'Il est midi.');

  const ctx = buildConversationContext(chatId, sender, 'Merci');
  assert.equal(ctx.history, 'Utilisateur: Quelle heure est-il ?\nAssistant: Il est midi.');
  assert.match(ctx.prompt, /Historique récent:\nUtilisateur: Quelle heure est-il \?/);
  clearSession(chatId, sender);
});

test('l’historique est limité aux 8 derniers messages', () => {
  const [chatId, sender] = ids();
  for (let i = 1; i <= 10; i += 1) appendSessionMessage(chatId, sender, 'user', `m${i}`);

  const { history } = buildConversationContext(chatId, sender, 'suite');
  const lines = history.split('\n');
  assert.equal(lines.length, 8);
  assert.equal(lines[0], 'Utilisateur: m3');
  assert.equal(lines.at(-1), 'Utilisateur: m10');
  clearSession(chatId, sender);
});

test('le prompt contient les consignes système du bot', () => {
  const [chatId, sender] = ids();
  const { prompt } = buildConversationContext(chatId, sender, 'test');
  assert.match(prompt, /RodrickBOT/);
  assert.match(prompt, /Réponds en français par défaut/);
});
