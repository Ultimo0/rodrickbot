import test from 'node:test';
import assert from 'node:assert/strict';

import {
  startDraft,
  getDraft,
  hasDraft,
  touchDraft,
  clearDraft,
  startDeleteConfirmation,
  getDeleteConfirmation,
  hasDeleteConfirmation,
  clearDeleteConfirmation,
} from '../src/core/poll/PollSessionManager.js';

let seq = 0;
const nextChat = () => `poll-session-${++seq}@g.us`;
const jid = (n) => `${n}@s.whatsapp.net`;

test('hasDraft est false tant qu\'aucun brouillon n\'a été démarré', () => {
  assert.equal(hasDraft(nextChat(), jid(1)), false);
});

test('startDraft initialise un brouillon vide à l\'étape "title"', () => {
  const chatId = nextChat();
  const draft = startDraft(chatId, jid(1));
  assert.equal(draft.step, 'title');
  assert.equal(draft.title, null);
  assert.deepEqual(draft.options, []);
  assert.equal(hasDraft(chatId, jid(1)), true);
});

test('les brouillons sont isolés par chat ET par expéditeur (clé composite)', () => {
  const chatA = nextChat();
  const chatB = nextChat();
  startDraft(chatA, jid(1));

  assert.equal(hasDraft(chatA, jid(1)), true);
  assert.equal(hasDraft(chatA, jid(2)), false); // autre utilisateur, même chat
  assert.equal(hasDraft(chatB, jid(1)), false); // même utilisateur, autre chat
});

test('startDraft appelé deux fois remplace le brouillon précédent (clearDraft implicite)', () => {
  const chatId = nextChat();
  const first = startDraft(chatId, jid(1));
  first.title = 'Ancien titre';

  const second = startDraft(chatId, jid(1));
  assert.equal(second.title, null);
  assert.equal(getDraft(chatId, jid(1)).title, null);
});

test('clearDraft supprime le brouillon en cours', () => {
  const chatId = nextChat();
  startDraft(chatId, jid(1));
  clearDraft(chatId, jid(1));
  assert.equal(hasDraft(chatId, jid(1)), false);
  assert.equal(getDraft(chatId, jid(1)), null);
});

test('clearDraft est sans effet si aucun brouillon n\'existe', () => {
  assert.doesNotThrow(() => clearDraft(nextChat(), jid(1)));
});

test('touchDraft ne modifie pas le contenu du brouillon, seulement son expiration', () => {
  const chatId = nextChat();
  const draft = startDraft(chatId, jid(1));
  draft.title = 'Mon titre';
  draft.options.push('A', 'B');

  touchDraft(chatId, jid(1));

  const still = getDraft(chatId, jid(1));
  assert.equal(still.title, 'Mon titre');
  assert.deepEqual(still.options, ['A', 'B']);
});

test('touchDraft retourne null si aucun brouillon n\'est en cours', () => {
  assert.equal(touchDraft(nextChat(), jid(1)), null);
});

test('hasDeleteConfirmation est false tant qu\'aucune suppression n\'a été demandée', () => {
  assert.equal(hasDeleteConfirmation(nextChat(), jid(1)), false);
});

test('startDeleteConfirmation enregistre le sondage ciblé', () => {
  const chatId = nextChat();
  startDeleteConfirmation(chatId, jid(1), 'poll123');
  const confirmation = getDeleteConfirmation(chatId, jid(1));
  assert.equal(confirmation.pollId, 'poll123');
  assert.equal(confirmation.action, 'delete');
});

test('clearDeleteConfirmation supprime la confirmation en attente', () => {
  const chatId = nextChat();
  startDeleteConfirmation(chatId, jid(1), 'poll123');
  clearDeleteConfirmation(chatId, jid(1));
  assert.equal(hasDeleteConfirmation(chatId, jid(1)), false);
});

test('brouillon et confirmation de suppression sont des états indépendants', () => {
  const chatId = nextChat();
  startDraft(chatId, jid(1));
  startDeleteConfirmation(chatId, jid(1), 'poll999');

  assert.equal(hasDraft(chatId, jid(1)), true);
  assert.equal(hasDeleteConfirmation(chatId, jid(1)), true);

  clearDraft(chatId, jid(1));
  assert.equal(hasDraft(chatId, jid(1)), false);
  assert.equal(hasDeleteConfirmation(chatId, jid(1)), true); // pas affectée par clearDraft
});

test('le brouillon expire automatiquement après le délai d\'inactivité et déclenche le callback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const chatId = nextChat();
  let expired = false;

  startDraft(chatId, jid(1), () => { expired = true; });
  assert.equal(hasDraft(chatId, jid(1)), true);

  t.mock.timers.tick(5 * 60 * 1000);

  assert.equal(expired, true);
  assert.equal(hasDraft(chatId, jid(1)), false);
});

test('touchDraft repousse effectivement l\'expiration (le brouillon survit au-delà du délai initial)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const chatId = nextChat();
  let expired = false;

  startDraft(chatId, jid(1), () => { expired = true; });

  t.mock.timers.tick(4 * 60 * 1000); // 4 min : pas encore expiré
  touchDraft(chatId, jid(1), () => { expired = true; }); // repousse de 5 min de plus

  t.mock.timers.tick(4 * 60 * 1000); // total réel 8 min, mais seulement 4 min depuis le touch
  assert.equal(expired, false);
  assert.equal(hasDraft(chatId, jid(1)), true);

  t.mock.timers.tick(60 * 1000); // 1 min de plus = 5 min depuis le touch
  assert.equal(expired, true);
});
