import test from 'node:test';
import assert from 'node:assert/strict';

import {
  setPendingChoice,
  getPendingChoice,
  clearPendingChoice,
} from '../src/core/downloadSessions.js';

let seq = 0;
function ids() {
  seq += 1;
  return [`dl-chat-${seq}@g.us`, `dl-user-${seq}@s.whatsapp.net`];
}

test('getPendingChoice retourne null sans session', () => {
  const [chatId, sender] = ids();
  assert.equal(getPendingChoice(chatId, sender), null);
});

test('setPendingChoice enregistre les données de la session', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const [chatId, sender] = ids();
  const data = { type: 'youtube', url: 'https://example.test/v' };

  setPendingChoice(chatId, sender, data, 60_000, () => {});
  assert.equal(getPendingChoice(chatId, sender).data, data);

  clearPendingChoice(chatId, sender);
});

test('la session expire et déclenche onTimeout', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const [chatId, sender] = ids();
  let timedOut = 0;

  setPendingChoice(chatId, sender, { type: 'tiktok' }, 30_000, () => {
    timedOut += 1;
  });

  t.mock.timers.tick(29_999);
  assert.equal(timedOut, 0);
  assert.notEqual(getPendingChoice(chatId, sender), null);

  t.mock.timers.tick(1);
  assert.equal(timedOut, 1);
  assert.equal(getPendingChoice(chatId, sender), null);
});

test('clearPendingChoice annule le minuteur d’expiration', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const [chatId, sender] = ids();
  let timedOut = 0;

  setPendingChoice(chatId, sender, { type: 'tiktok' }, 10_000, () => {
    timedOut += 1;
  });
  clearPendingChoice(chatId, sender);

  t.mock.timers.tick(20_000);
  assert.equal(timedOut, 0);
  assert.equal(getPendingChoice(chatId, sender), null);
});

test('clearPendingChoice est sans effet sur une session inexistante', () => {
  const [chatId, sender] = ids();
  assert.doesNotThrow(() => clearPendingChoice(chatId, sender));
});

test('un nouveau choix remplace le précédent sans déclencher son timeout', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const [chatId, sender] = ids();
  let firstTimedOut = 0;

  setPendingChoice(chatId, sender, { type: 'tiktok' }, 5_000, () => {
    firstTimedOut += 1;
  });
  setPendingChoice(chatId, sender, { type: 'youtube' }, 60_000, () => {});

  t.mock.timers.tick(10_000);
  assert.equal(firstTimedOut, 0);
  assert.equal(getPendingChoice(chatId, sender).data.type, 'youtube');

  clearPendingChoice(chatId, sender);
});

test('les sessions sont isolées par chat et par expéditeur', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const [chatId, sender] = ids();
  const [otherChat, otherSender] = ids();

  setPendingChoice(chatId, sender, { type: 'tiktok' }, 60_000, () => {});
  assert.equal(getPendingChoice(otherChat, sender), null);
  assert.equal(getPendingChoice(chatId, otherSender), null);

  clearPendingChoice(chatId, sender);
});
