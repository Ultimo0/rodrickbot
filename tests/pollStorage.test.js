import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Même précaution que tests/warnStore.test.js : le module écrit polls.json
// dans process.cwd(), donc on isole les tests dans un dossier temporaire
// avant de l'importer (l'import déclenche load() au chargement du module).
const workDir = mkdtempSync(path.join(tmpdir(), 'rodrickbot-poll-storage-'));
process.chdir(workDir);

const {
  createPoll,
  getPoll,
  getPollByMessageId,
  getMostRecentPollForChat,
  attachMessageId,
  setVote,
  closePoll,
  updatePollClosesAt,
  deletePoll,
  listActivePollsForChat,
  listAllActivePolls,
  getExpiredActivePolls,
} = await import('../src/core/poll/PollStorage.js');

const readPersisted = () => JSON.parse(readFileSync(path.join(workDir, 'polls.json'), 'utf-8'));

let seq = 0;
const nextChat = () => `poll-storage-${++seq}@g.us`;
const jid = (n) => `${n}@s.whatsapp.net`;

function basePoll(chatId) {
  return createPoll({
    chatId,
    creatorId: jid(1),
    title: 'Titre de test',
    options: ['A', 'B', 'C'],
    closesAt: null,
  });
}

test('createPoll génère un identifiant court (6 caractères) et lisible', () => {
  const poll = basePoll(nextChat());
  assert.equal(poll.id.length, 6);
  assert.match(poll.id, /^[0-9a-f]{6}$/);
});

test('createPoll numérote les options par index stable, en partant de "0"', () => {
  const poll = basePoll(nextChat());
  assert.deepEqual(
    poll.options,
    [{ id: '0', text: 'A' }, { id: '1', text: 'B' }, { id: '2', text: 'C' }]
  );
});

test('createPoll initialise un sondage actif, sans votes, sans messageId', () => {
  const poll = basePoll(nextChat());
  assert.equal(poll.status, 'active');
  assert.deepEqual(poll.votes, {});
  assert.equal(poll.messageId, null);
  assert.equal(poll.closedAt, null);
});

test('createPoll persiste immédiatement sur disque', () => {
  const poll = basePoll(nextChat());
  const persisted = readPersisted();
  assert.ok(persisted[poll.id]);
  assert.equal(persisted[poll.id].title, 'Titre de test');
});

test('getPoll retourne null pour un identifiant inconnu', () => {
  assert.equal(getPoll('inexistant'), null);
});

test('attachMessageId relie un sondage à sa carte WhatsApp', () => {
  const poll = basePoll(nextChat());
  attachMessageId(poll.id, 'WAMSG123');
  assert.equal(getPoll(poll.id).messageId, 'WAMSG123');
});

test('getPollByMessageId retrouve le sondage à partir du messageId de sa carte', () => {
  const poll = basePoll(nextChat());
  attachMessageId(poll.id, 'WAMSG456');
  const found = getPollByMessageId('WAMSG456');
  assert.equal(found.id, poll.id);
});

test('getPollByMessageId retourne null si aucun sondage n\'a ce messageId', () => {
  assert.equal(getPollByMessageId('INCONNU'), null);
  assert.equal(getPollByMessageId(null), null);
});

test('setVote enregistre un vote et met à jour lastActivityAt', () => {
  const poll = basePoll(nextChat());
  const before = poll.lastActivityAt;
  const updated = setVote(poll.id, jid(2), '1');
  assert.equal(updated.votes[jid(2)], '1');
  assert.ok(updated.lastActivityAt >= before);
});

test('setVote appelé deux fois pour le même utilisateur REMPLACE le vote (un utilisateur peut changer d\'avis)', () => {
  const poll = basePoll(nextChat());
  setVote(poll.id, jid(2), '0');
  const updated = setVote(poll.id, jid(2), '2');
  assert.equal(updated.votes[jid(2)], '2');
  assert.equal(Object.keys(updated.votes).length, 1); // pas deux entrées, une seule remplacée
});

test('plusieurs utilisateurs peuvent voter indépendamment sur le même sondage', () => {
  const poll = basePoll(nextChat());
  setVote(poll.id, jid(2), '0');
  setVote(poll.id, jid(3), '1');
  const updated = getPoll(poll.id);
  assert.equal(updated.votes[jid(2)], '0');
  assert.equal(updated.votes[jid(3)], '1');
});

test('closePoll change le statut et enregistre la raison de fermeture', () => {
  const poll = basePoll(nextChat());
  const closed = closePoll(poll.id, 'manual');
  assert.equal(closed.status, 'closed');
  assert.equal(closed.closedReason, 'manual');
  assert.ok(closed.closedAt);
});

test('closePoll avec la raison "expired" est distinguable d\'une fermeture manuelle', () => {
  const poll = basePoll(nextChat());
  const closed = closePoll(poll.id, 'expired');
  assert.equal(closed.closedReason, 'expired');
});

test('deletePoll retire définitivement le sondage et retourne true', () => {
  const poll = basePoll(nextChat());
  const result = deletePoll(poll.id);
  assert.equal(result, true);
  assert.equal(getPoll(poll.id), null);
});

test('deletePoll retourne false pour un sondage déjà inexistant (idempotent)', () => {
  assert.equal(deletePoll('jamais-cree'), false);
});

test('listActivePollsForChat ne retourne que les sondages actifs de CE chat', () => {
  const chatA = nextChat();
  const chatB = nextChat();
  const p1 = basePoll(chatA);
  const p2 = basePoll(chatA);
  const p3 = basePoll(chatB);
  closePoll(p2.id, 'manual');

  const activeInA = listActivePollsForChat(chatA);
  assert.equal(activeInA.length, 1);
  assert.equal(activeInA[0].id, p1.id);
  assert.equal(listActivePollsForChat(chatB).length, 1);
  assert.equal(listActivePollsForChat(chatB)[0].id, p3.id);
});

test('getMostRecentPollForChat retourne le dernier sondage créé (tout statut confondu)', () => {
  const chatId = nextChat();
  basePoll(chatId);
  const second = basePoll(chatId);
  assert.equal(getMostRecentPollForChat(chatId).id, second.id);
});

test('getMostRecentPollForChat reste correct même si deux sondages ont EXACTEMENT le même createdAt (départage par seq, pas par timestamp)', () => {
  const chatId = nextChat();
  const first = basePoll(chatId);
  const second = basePoll(chatId);
  // Simule deux créations dans la même milliseconde (cas réel possible :
  // Date.now() a une résolution d'1ms, deux requêtes rapprochées peuvent
  // tomber sur la même valeur).
  second.createdAt = first.createdAt;
  assert.notEqual(first.seq, second.seq, 'seq doit rester strictement croissant même à createdAt égal');
  assert.equal(getMostRecentPollForChat(chatId).id, second.id);
});

test('getMostRecentPollForChat retourne null si le chat n\'a aucun sondage', () => {
  assert.equal(getMostRecentPollForChat(nextChat()), null);
});

test('updatePollClosesAt fixe/change la date d\'expiration', () => {
  const poll = basePoll(nextChat());
  const closesAt = Date.now() + 3_600_000;
  const updated = updatePollClosesAt(poll.id, closesAt);
  assert.equal(updated.closesAt, closesAt);
});

test('getExpiredActivePolls ne retourne que les sondages actifs dont closesAt est dépassé', () => {
  const chatId = nextChat();
  const expired = basePoll(chatId);
  const notExpired = basePoll(chatId);
  const closed = basePoll(chatId);

  updatePollClosesAt(expired.id, Date.now() - 1000); // déjà passé
  updatePollClosesAt(notExpired.id, Date.now() + 3_600_000); // dans le futur
  updatePollClosesAt(closed.id, Date.now() - 1000);
  closePoll(closed.id, 'manual'); // expiré MAIS déjà fermé -> ne doit pas ressortir

  const results = getExpiredActivePolls();
  const ids = results.map((p) => p.id);
  assert.ok(ids.includes(expired.id));
  assert.ok(!ids.includes(notExpired.id));
  assert.ok(!ids.includes(closed.id));
});

test('listAllActivePolls ignore les sondages fermés, tous chats confondus', () => {
  const chatA = nextChat();
  const chatB = nextChat();
  const active1 = basePoll(chatA);
  const active2 = basePoll(chatB);
  const closed = basePoll(chatA);
  closePoll(closed.id, 'manual');

  const all = listAllActivePolls();
  const ids = all.map((p) => p.id);
  assert.ok(ids.includes(active1.id));
  assert.ok(ids.includes(active2.id));
  assert.ok(!ids.includes(closed.id));
});
