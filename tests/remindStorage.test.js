import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const workDir = mkdtempSync(path.join(tmpdir(), 'rodrickbot-remind-storage-'));
process.chdir(workDir);

const {
  createReminder,
  getReminder,
  getRemindersForUser,
  getActiveRemindersForUser,
  countActiveRemindersForUser,
  getDueReminders,
  markSent,
  markExpired,
  cancelReminder,
  cancelAllForUser,
} = await import('../src/core/remind/RemindStorage.js');

const readPersisted = () => JSON.parse(readFileSync(path.join(workDir, 'reminders.json'), 'utf-8'));

let seq = 0;
const nextUser = () => `remind-storage-${++seq}@s.whatsapp.net`;

function baseReminder(userId, overrides = {}) {
  return createReminder({
    userId,
    chatId: userId,
    message: 'Message de test',
    scheduledAt: Date.now() + 3_600_000,
    timezone: 'Africa/Douala',
    recurrence: null,
    ...overrides,
  });
}

test('createReminder génère un identifiant court (6 caractères)', () => {
  const r = baseReminder(nextUser());
  assert.equal(r.id.length, 6);
});

test('createReminder initialise le statut "pending" et lastSentAt à null', () => {
  const r = baseReminder(nextUser());
  assert.equal(r.status, 'pending');
  assert.equal(r.lastSentAt, null);
});

test('createReminder persiste immédiatement sur disque', () => {
  const r = baseReminder(nextUser());
  const persisted = readPersisted();
  assert.ok(persisted[r.id]);
  assert.equal(persisted[r.id].message, 'Message de test');
});

test('getReminder retourne null pour un id inconnu', () => {
  assert.equal(getReminder('inconnu'), null);
});

test('getRemindersForUser ne retourne que les rappels de CET utilisateur, tout statut confondu', () => {
  const userA = nextUser();
  const userB = nextUser();
  baseReminder(userA);
  baseReminder(userA);
  baseReminder(userB);
  assert.equal(getRemindersForUser(userA).length, 2);
  assert.equal(getRemindersForUser(userB).length, 1);
});

test('getActiveRemindersForUser exclut les rappels annulés/envoyés/expirés', () => {
  const user = nextUser();
  const pending = baseReminder(user);
  const toCancel = baseReminder(user);
  cancelReminder(toCancel.id);

  const active = getActiveRemindersForUser(user);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, pending.id);
});

test('countActiveRemindersForUser compte correctement (utilisé pour la limite MAX_ACTIVE_REMINDERS_PER_USER)', () => {
  const user = nextUser();
  baseReminder(user);
  baseReminder(user);
  assert.equal(countActiveRemindersForUser(user), 2);
});

test('getDueReminders ne retourne que les rappels "pending" dont scheduledAt est dépassé', () => {
  const user = nextUser();
  const due = baseReminder(user, { scheduledAt: Date.now() - 1000 });
  const notDue = baseReminder(user, { scheduledAt: Date.now() + 3_600_000 });
  const alreadySent = baseReminder(user, { scheduledAt: Date.now() - 1000 });
  markSent(alreadySent.id); // ne doit plus ressortir même si scheduledAt est dans le passé

  const results = getDueReminders();
  const ids = results.map((r) => r.id);
  assert.ok(ids.includes(due.id));
  assert.ok(!ids.includes(notDue.id));
  assert.ok(!ids.includes(alreadySent.id));
});

test('markSent (sans récurrence) passe le statut à "sent" définitivement', () => {
  const r = baseReminder(nextUser());
  const updated = markSent(r.id);
  assert.equal(updated.status, 'sent');
  assert.ok(updated.lastSentAt);
});

test('markSent AVEC une prochaine échéance (récurrence) reste "pending" et met à jour scheduledAt', () => {
  const r = baseReminder(nextUser(), { recurrence: { type: 'daily', time: '08:00' } });
  const nextMs = Date.now() + 24 * 60 * 60 * 1000;
  const updated = markSent(r.id, nextMs);
  assert.equal(updated.status, 'pending'); // reste actif, c'est ce qui permet la récurrence
  assert.equal(updated.scheduledAt, nextMs);
  assert.ok(updated.lastSentAt); // trace que ça a bien été envoyé au moins une fois
});

test('markExpired passe le statut à "expired"', () => {
  const r = baseReminder(nextUser());
  const updated = markExpired(r.id);
  assert.equal(updated.status, 'expired');
});

test('cancelReminder passe le statut à "cancelled" et retourne le rappel', () => {
  const r = baseReminder(nextUser());
  const cancelled = cancelReminder(r.id);
  assert.equal(cancelled.status, 'cancelled');
});

test('cancelReminder retourne null pour un id inconnu (jamais d\'exception)', () => {
  assert.doesNotThrow(() => cancelReminder('inconnu'));
  assert.equal(cancelReminder('inconnu'), null);
});

test('cancelAllForUser n\'annule que les rappels "pending" de CET utilisateur, retourne le nombre annulé', () => {
  const userA = nextUser();
  const userB = nextUser();
  baseReminder(userA);
  baseReminder(userA);
  const alreadyCancelled = baseReminder(userA);
  cancelReminder(alreadyCancelled.id);
  baseReminder(userB); // ne doit pas être touché

  const count = cancelAllForUser(userA);
  assert.equal(count, 2); // pas 3 : celui déjà annulé n'est pas recompté
  assert.equal(countActiveRemindersForUser(userA), 0);
  assert.equal(countActiveRemindersForUser(userB), 1);
});

test('deux rappels créés dans la même milliseconde restent distincts et ordonnés par seq (même correctif que PollStorage)', () => {
  const user = nextUser();
  const first = baseReminder(user);
  const second = baseReminder(user);
  second.createdAt = first.createdAt; // simule une création simultanée
  assert.notEqual(first.seq, second.seq);
  assert.ok(second.seq > first.seq);
});
