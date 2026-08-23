import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const workDir = mkdtempSync(path.join(tmpdir(), 'rodrickbot-remind-scheduler-'));
process.chdir(workDir);

const { runSweepForTests } = await import('../src/core/remind/RemindScheduler.js');
const RemindManager = await import('../src/core/remind/RemindManager.js');
const { getReminder, createReminder, getActiveRemindersForUser } = await import('../src/core/remind/RemindStorage.js');

let seq = 0;
const nextChat = () => `remind-scheduler-${++seq}@s.whatsapp.net`;
const user = (n) => `${n}@s.whatsapp.net`;

function createMockSock() {
  const sent = [];
  return {
    sent,
    sendMessage: async (chatId, content) => {
      sent.push({ chatId, content });
      return { key: { id: `MSG${sent.length}` } };
    },
  };
}

function directCreate(userId, overrides = {}) {
  return createReminder({
    userId,
    chatId: userId,
    message: 'Message de test',
    scheduledAt: Date.now() - 1000, // déjà dû
    timezone: 'Africa/Douala',
    recurrence: null,
    ...overrides,
  });
}

test('un balayage envoie tous les rappels dus et les marque "sent"', async () => {
  const sock = createMockSock();
  const u = user(1);
  const r1 = directCreate(u);
  const r2 = directCreate(u);

  await runSweepForTests(sock);

  assert.equal(getReminder(r1.id).status, 'sent');
  assert.equal(getReminder(r2.id).status, 'sent');
  assert.equal(sock.sent.length, 2);
});

test('un balayage ignore les rappels dont l\'échéance n\'est pas encore atteinte', async () => {
  const sock = createMockSock();
  const u = user(2);
  const future = directCreate(u, { scheduledAt: Date.now() + 3_600_000 });

  await runSweepForTests(sock);

  assert.equal(getReminder(future.id).status, 'pending');
  assert.equal(sock.sent.length, 0);
});

test('un rappel en retard de plus de 24h expire SANS être envoyé', async () => {
  const sock = createMockSock();
  const u = user(3);
  const veryLate = directCreate(u, { scheduledAt: Date.now() - 25 * 60 * 60 * 1000 }); // 25h de retard

  await runSweepForTests(sock);

  assert.equal(getReminder(veryLate.id).status, 'expired');
  assert.equal(sock.sent.length, 0); // jamais envoyé, contrairement à un rappel juste "dû"
});

test('un rappel récurrent est reprogrammé après le balayage, jamais définitivement "sent"', async () => {
  const sock = createMockSock();
  const u = user(4);
  const recurring = directCreate(u, {
    recurrence: { type: 'daily', time: '08:00' },
  });

  await runSweepForTests(sock);

  const updated = getReminder(recurring.id);
  assert.equal(updated.status, 'pending');
  assert.ok(updated.scheduledAt > Date.now());
});

test('deux balayages successifs sans nouveau rappel dû n\'envoient rien la seconde fois (pas de double envoi)', async () => {
  const sock = createMockSock();
  const u = user(5);
  directCreate(u);

  await runSweepForTests(sock);
  const sentAfterFirst = sock.sent.length;
  await runSweepForTests(sock);

  assert.equal(sock.sent.length, sentAfterFirst); // rien de plus au second passage
});

test('un balayage traite correctement PLUSIEURS rappels de PLUSIEURS utilisateurs simultanément (brief: "deux utilisateurs créant des rappels en même temps")', async () => {
  const sock = createMockSock();
  const userA = user(10);
  const userB = user(11);
  directCreate(userA);
  directCreate(userA);
  directCreate(userB);

  await runSweepForTests(sock);

  assert.equal(getActiveRemindersForUser(userA).length, 0);
  assert.equal(getActiveRemindersForUser(userB).length, 0);
  assert.equal(sock.sent.length, 3);
});

test('un rappel qui échoue à l\'envoi n\'empêche pas le traitement des autres rappels dus dans le même balayage', async () => {
  const workingUser = user(20);
  const brokenUser = user(21);
  const brokenReminder = directCreate(brokenUser);
  const workingReminder = directCreate(workingUser);

  const partiallyBrokenSock = {
    sent: [],
    sendMessage: async function (chatId, content) {
      if (chatId === brokenUser) throw new Error('Échec réseau simulé');
      this.sent.push({ chatId, content });
      return { key: { id: `MSG${this.sent.length}` } };
    },
  };

  await assert.doesNotReject(() => runSweepForTests(partiallyBrokenSock));

  assert.equal(getReminder(brokenReminder.id).status, 'pending'); // échec -> retenté au prochain balayage, pas perdu
  assert.equal(getReminder(workingReminder.id).status, 'sent'); // l'autre utilisateur n'est pas impacté par la panne du premier
});

test('le balayage ne plante jamais même si un rappel a des données partiellement incohérentes', async () => {
  const sock = createMockSock();
  const u = user(30);
  // Un rappel "pending" mais avec un scheduledAt aberrant (chaîne au lieu
  // d'un nombre) ne doit jamais faire planter tout le balayage — les
  // autres rappels valides doivent quand même être traités.
  const corrupted = createReminder({
    userId: u, chatId: u, message: 'corrompu', scheduledAt: Date.now() - 1000,
    timezone: 'Africa/Douala', recurrence: null,
  });
  corrupted.scheduledAt = 'pas-un-nombre'; // corruption directe en mémoire après création
  const healthy = directCreate(u);

  await assert.doesNotReject(() => runSweepForTests(sock));
  // Le rappel sain a quand même dû être traité malgré le voisin corrompu.
  assert.equal(getReminder(healthy.id).status, 'sent');
});
