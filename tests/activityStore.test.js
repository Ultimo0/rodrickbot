import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Le module écrit activity.json dans process.cwd() : isolation dans un
// dossier temporaire avant import, comme warnStore.test.js.
const workDir = mkdtempSync(path.join(tmpdir(), 'rodrickbot-activity-store-'));
process.chdir(workDir);

const {
  recordActivity,
  getGroupSummary,
  getUserPeriodCount,
  getUserSummary,
  getTopUsers,
  getInactiveMembers,
  resetGroupActivity,
  normalizePeriod,
  _reloadFromDiskForTests,
} = await import('../src/core/activityStore.js');

const DATA_FILE = path.join(workDir, 'activity.json');

let seq = 0;
const nextChat = () => `activity-${++seq}@g.us`;
const jid = (n) => `${n}@s.whatsapp.net`;

const dateKey = (daysAgo = 0) => new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

/** Écrit directement un état d'activité crafté sur disque puis recharge le module (simule aussi un redémarrage). */
function writeRawAndReload(state) {
  writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  _reloadFromDiskForTests();
}

// ---------------------------------------------------------------------
// normalizePeriod
// ---------------------------------------------------------------------

test('normalizePeriod accepte today/week/month/Nd et rejette le reste', () => {
  assert.equal(normalizePeriod('today'), 'today');
  assert.equal(normalizePeriod('WEEK'), 'week');
  assert.equal(normalizePeriod('month'), 'month');
  assert.equal(normalizePeriod('7d'), '7d');
  assert.equal(normalizePeriod('30d'), '30d');
  assert.equal(normalizePeriod(undefined), 'today');
  assert.equal(normalizePeriod('nimportequoi'), null);
  assert.equal(normalizePeriod('d7'), null);
});

// ---------------------------------------------------------------------
// Comptage
// ---------------------------------------------------------------------

test('recordActivity incrémente le total et le bucket du jour', () => {
  const chatId = nextChat();
  recordActivity(chatId, jid(1));
  recordActivity(chatId, jid(1));
  recordActivity(chatId, jid(1));

  const stats = getUserSummary(chatId, jid(1));
  assert.equal(stats.total, 3);
  assert.equal(stats.today, 3);
});

test('recordActivity distingue bien les utilisateurs entre eux', () => {
  const chatId = nextChat();
  recordActivity(chatId, jid(1));
  recordActivity(chatId, jid(2));
  recordActivity(chatId, jid(2));

  assert.equal(getUserSummary(chatId, jid(1)).total, 1);
  assert.equal(getUserSummary(chatId, jid(2)).total, 2);
});

// ---------------------------------------------------------------------
// Périodes (today / week / month / Nd) via données craftées
// ---------------------------------------------------------------------

test('les périodes today/week/month/7d/30d sont calculées correctement', () => {
  const chatId = nextChat();
  const user = jid(42);

  // 1 message aujourd'hui, 1 il y a 3 jours, 1 il y a 10 jours, 1 il y a 40 jours.
  const daily = {
    [dateKey(0)]: 1,
    [dateKey(3)]: 1,
    [dateKey(10)]: 1,
    [dateKey(40)]: 1,
  };
  writeRawAndReload({ [chatId]: { [user]: { total: 4, daily, lastActivity: Date.now() } } });

  assert.equal(getUserPeriodCount(chatId, user, 'today'), 1);
  assert.equal(getUserPeriodCount(chatId, user, '7d'), 2); // aujourd'hui + il y a 3j
  assert.equal(getUserPeriodCount(chatId, user, '30d'), 3); // + il y a 10j, pas les 40j
  // "month" = mois calendaire en cours -> dépend du jour d'exécution du
  // test, donc on vérifie juste qu'il est >= today et <= total (borne
  // large mais fiable indépendamment de la date d'exécution).
  const month = getUserPeriodCount(chatId, user, 'month');
  assert.ok(month >= 1 && month <= 4);
});

test('getGroupSummary agrège today/week/month sur tous les utilisateurs du groupe', () => {
  const chatId = nextChat();
  const daily1 = { [dateKey(0)]: 2 };
  const daily2 = { [dateKey(0)]: 5 };
  writeRawAndReload({
    [chatId]: {
      [jid(1)]: { total: 2, daily: daily1, lastActivity: Date.now() - 1000 },
      [jid(2)]: { total: 5, daily: daily2, lastActivity: Date.now() },
    },
  });

  const summary = getGroupSummary(chatId);
  assert.equal(summary.today, 7);
  assert.ok(summary.lastActivity !== null);
});

// ---------------------------------------------------------------------
// Classement
// ---------------------------------------------------------------------

test('getTopUsers classe par ordre décroissant et respecte la limite', () => {
  const chatId = nextChat();
  writeRawAndReload({
    [chatId]: {
      [jid(1)]: { total: 5, daily: {}, lastActivity: Date.now() },
      [jid(2)]: { total: 20, daily: {}, lastActivity: Date.now() },
      [jid(3)]: { total: 12, daily: {}, lastActivity: Date.now() },
    },
  });

  const top2 = getTopUsers(chatId, 'total', 2);
  assert.deepEqual(top2.map((u) => u.jid), [jid(2), jid(3)]);
  assert.equal(top2[0].count, 20);
});

test('getTopUsers filtre les utilisateurs à 0 message sur la période demandée', () => {
  const chatId = nextChat();
  writeRawAndReload({
    [chatId]: {
      [jid(1)]: { total: 10, daily: { [dateKey(0)]: 10 }, lastActivity: Date.now() },
      [jid(2)]: { total: 10, daily: { [dateKey(20)]: 10 }, lastActivity: Date.now() - 999999 },
    },
  });

  const topToday = getTopUsers(chatId, 'today', 10);
  assert.deepEqual(topToday.map((u) => u.jid), [jid(1)]);
});

// ---------------------------------------------------------------------
// Statistiques individuelles / absence de données
// ---------------------------------------------------------------------

test('getUserSummary retourne des valeurs neutres pour un utilisateur inconnu', () => {
  const chatId = nextChat();
  const stats = getUserSummary(chatId, jid(999));
  assert.deepEqual(stats, { total: 0, today: 0, week: 0, month: 0, lastActivity: null });
});

test('getGroupSummary retourne des valeurs neutres pour un groupe inconnu', () => {
  const summary = getGroupSummary(nextChat());
  assert.deepEqual(summary, { today: 0, week: 0, month: 0, lastActivity: null });
});

test('getTopUsers retourne un tableau vide pour un groupe inconnu', () => {
  assert.deepEqual(getTopUsers(nextChat(), 'total', 10), []);
});

// ---------------------------------------------------------------------
// Inactivité
// ---------------------------------------------------------------------

test('getInactiveMembers distingue actif / inactif / donnée inconnue', () => {
  const chatId = nextChat();
  const activeMs = Date.now() - 1 * 24 * 60 * 60 * 1000; // hier
  const oldMs = Date.now() - 40 * 24 * 60 * 60 * 1000; // il y a 40 jours

  writeRawAndReload({
    [chatId]: {
      [jid(1)]: { total: 5, daily: {}, lastActivity: activeMs },
      [jid(2)]: { total: 5, daily: {}, lastActivity: oldMs },
      // jid(3) : jamais vu dans le store du tout.
    },
  });

  const { inactive, unknown } = getInactiveMembers(chatId, [jid(1), jid(2), jid(3)], 30);

  assert.deepEqual(inactive.map((m) => m.jid), [jid(2)]);
  assert.deepEqual(unknown, [jid(3)]);
});

test("un membre sans donnée n'est jamais classé inactif à tort", () => {
  const chatId = nextChat();
  const { inactive, unknown } = getInactiveMembers(chatId, [jid(1)], 30);
  assert.deepEqual(inactive, []);
  assert.deepEqual(unknown, [jid(1)]);
});

// ---------------------------------------------------------------------
// Plusieurs groupes (isolation)
// ---------------------------------------------------------------------

test('les statistiques sont bien isolées par groupe', () => {
  const chatA = nextChat();
  const chatB = nextChat();
  recordActivity(chatA, jid(1));
  recordActivity(chatA, jid(1));
  recordActivity(chatB, jid(1));

  assert.equal(getUserSummary(chatA, jid(1)).total, 2);
  assert.equal(getUserSummary(chatB, jid(1)).total, 1);
});

// ---------------------------------------------------------------------
// Redémarrage (persistance + relecture disque)
// ---------------------------------------------------------------------

test('les données survivent à un redémarrage simulé (écriture + relecture disque)', () => {
  const chatId = nextChat();

  // Simule l'état persisté juste avant un arrêt du bot, puis un
  // redémarrage qui relit ce fichier — c'est exactement le mécanisme
  // utilisé en production (voir core/state.js pour le même principe de
  // sauvegarde différée + flush avant arrêt).
  writeRawAndReload({ [chatId]: { [jid(7)]: { total: 2, daily: { [dateKey(0)]: 2 }, lastActivity: Date.now() } } });

  const stats = getUserSummary(chatId, jid(7));
  assert.equal(stats.total, 2);
  assert.equal(stats.today, 2);
});

// ---------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------

test('resetGroupActivity supprime uniquement les données du groupe ciblé', () => {
  const chatA = nextChat();
  const chatB = nextChat();
  recordActivity(chatA, jid(1));
  recordActivity(chatB, jid(1));

  resetGroupActivity(chatA);

  assert.equal(getUserSummary(chatA, jid(1)).total, 0);
  assert.equal(getUserSummary(chatB, jid(1)).total, 1);
});
