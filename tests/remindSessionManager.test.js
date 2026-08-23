import test from 'node:test';
import assert from 'node:assert/strict';

import {
  startDraft,
  getDraft,
  hasDraft,
  touchDraft,
  clearDraft,
  startCancelAllConfirmation,
  hasCancelAllConfirmation,
  clearCancelAllConfirmation,
} from '../src/core/remind/RemindSessionManager.js';

let seq = 0;
const nextChat = () => `remind-session-${++seq}@s.whatsapp.net`;
const sender = (n) => `${n}@s.whatsapp.net`;

test('hasDraft est false tant qu\'aucun brouillon n\'a été démarré', () => {
  assert.equal(hasDraft(nextChat(), sender(1)), false);
});

test('startDraft initialise un brouillon à l\'étape "menu"', () => {
  const chatId = nextChat();
  const draft = startDraft(chatId, sender(1));
  assert.equal(draft.step, 'menu');
  assert.equal(draft.scheduledAt, null);
  assert.equal(hasDraft(chatId, sender(1)), true);
});

test('les brouillons sont isolés par chat ET par expéditeur', () => {
  const chatA = nextChat();
  const chatB = nextChat();
  startDraft(chatA, sender(1));
  assert.equal(hasDraft(chatA, sender(1)), true);
  assert.equal(hasDraft(chatA, sender(2)), false);
  assert.equal(hasDraft(chatB, sender(1)), false);
});

test('startDraft appelé deux fois remplace le brouillon précédent', () => {
  const chatId = nextChat();
  const first = startDraft(chatId, sender(1));
  first.step = 'message';
  const second = startDraft(chatId, sender(1));
  assert.equal(second.step, 'menu');
  assert.equal(getDraft(chatId, sender(1)).step, 'menu');
});

test('clearDraft supprime le brouillon en cours', () => {
  const chatId = nextChat();
  startDraft(chatId, sender(1));
  clearDraft(chatId, sender(1));
  assert.equal(hasDraft(chatId, sender(1)), false);
});

test('clearDraft est sans effet si aucun brouillon n\'existe', () => {
  assert.doesNotThrow(() => clearDraft(nextChat(), sender(1)));
});

test('touchDraft ne modifie pas le contenu du brouillon, seulement son expiration', () => {
  const chatId = nextChat();
  const draft = startDraft(chatId, sender(1));
  draft.step = 'message';
  draft.label = 'Dans : 10 minutes';
  touchDraft(chatId, sender(1));
  const still = getDraft(chatId, sender(1));
  assert.equal(still.step, 'message');
  assert.equal(still.label, 'Dans : 10 minutes');
});

test('touchDraft retourne null si aucun brouillon n\'est en cours', () => {
  assert.equal(touchDraft(nextChat(), sender(1)), null);
});

test('le brouillon expire après le délai d\'inactivité et déclenche le callback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const chatId = nextChat();
  let expired = false;
  startDraft(chatId, sender(1), () => { expired = true; });
  t.mock.timers.tick(5 * 60 * 1000);
  assert.equal(expired, true);
  assert.equal(hasDraft(chatId, sender(1)), false);
});

test('touchDraft repousse effectivement l\'expiration', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const chatId = nextChat();
  let expired = false;
  startDraft(chatId, sender(1), () => { expired = true; });
  t.mock.timers.tick(4 * 60 * 1000);
  touchDraft(chatId, sender(1), () => { expired = true; });
  t.mock.timers.tick(4 * 60 * 1000); // 8 min réelles, mais seulement 4 depuis le touch
  assert.equal(expired, false);
  t.mock.timers.tick(60 * 1000); // 5 min depuis le touch
  assert.equal(expired, true);
});

test('hasCancelAllConfirmation est false tant qu\'aucune confirmation n\'a été démarrée', () => {
  assert.equal(hasCancelAllConfirmation(nextChat(), sender(1)), false);
});

test('startCancelAllConfirmation puis clearCancelAllConfirmation', () => {
  const chatId = nextChat();
  startCancelAllConfirmation(chatId, sender(1));
  assert.equal(hasCancelAllConfirmation(chatId, sender(1)), true);
  clearCancelAllConfirmation(chatId, sender(1));
  assert.equal(hasCancelAllConfirmation(chatId, sender(1)), false);
});

test('confirmation cancel-all expire après son délai et déclenche le callback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const chatId = nextChat();
  let expired = false;
  startCancelAllConfirmation(chatId, sender(1), () => { expired = true; });
  t.mock.timers.tick(5 * 60 * 1000);
  assert.equal(expired, true);
  assert.equal(hasCancelAllConfirmation(chatId, sender(1)), false);
});

test('brouillon et confirmation cancel-all sont des états indépendants', () => {
  const chatId = nextChat();
  startDraft(chatId, sender(1));
  startCancelAllConfirmation(chatId, sender(1));
  assert.equal(hasDraft(chatId, sender(1)), true);
  assert.equal(hasCancelAllConfirmation(chatId, sender(1)), true);
  clearDraft(chatId, sender(1));
  assert.equal(hasDraft(chatId, sender(1)), false);
  assert.equal(hasCancelAllConfirmation(chatId, sender(1)), true);
});
