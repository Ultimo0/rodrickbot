import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Le module écrit warnings.json dans process.cwd() : on isole donc les tests
// dans un dossier temporaire avant de l'importer.
const workDir = mkdtempSync(path.join(tmpdir(), 'rodrickbot-warn-store-'));
process.chdir(workDir);

const { addWarn, getWarns, resetWarns, WARN_LIMIT } = await import('../src/core/warnStore.js');

const readPersisted = () => JSON.parse(readFileSync(path.join(workDir, 'warnings.json'), 'utf-8'));

let seq = 0;
const nextChat = () => `warn-${++seq}@g.us`;
const jid = (n) => `${n}@s.whatsapp.net`;

test('WARN_LIMIT est la limite avant expulsion', () => {
  assert.equal(WARN_LIMIT, 3);
});

test('getWarns retourne 0 pour un utilisateur inconnu', () => {
  assert.equal(getWarns(nextChat(), jid(1)), 0);
});

test('addWarn incrémente et retourne le compteur', () => {
  const chatId = nextChat();
  assert.equal(addWarn(chatId, jid(1)), 1);
  assert.equal(addWarn(chatId, jid(1)), 2);
  assert.equal(getWarns(chatId, jid(1)), 2);
});

test('addWarn persiste les avertissements sur disque', () => {
  const chatId = nextChat();
  addWarn(chatId, jid(7));
  assert.equal(readPersisted()[chatId][jid(7)], 1);
});

test('les compteurs sont indépendants par utilisateur et par groupe', () => {
  const a = nextChat();
  const b = nextChat();

  addWarn(a, jid(1));
  addWarn(a, jid(1));
  addWarn(a, jid(2));
  addWarn(b, jid(1));

  assert.equal(getWarns(a, jid(1)), 2);
  assert.equal(getWarns(a, jid(2)), 1);
  assert.equal(getWarns(b, jid(1)), 1);
});

test('resetWarns remet le compteur à zéro', () => {
  const chatId = nextChat();
  addWarn(chatId, jid(1));
  resetWarns(chatId, jid(1));

  assert.equal(getWarns(chatId, jid(1)), 0);
  assert.equal(readPersisted()[chatId][jid(1)], undefined);
});

test('resetWarns est sans effet sur un utilisateur ou un groupe inconnu', () => {
  const chatId = nextChat();
  assert.doesNotThrow(() => resetWarns(chatId, jid(1)));

  addWarn(chatId, jid(1));
  resetWarns(chatId, jid(99));
  assert.equal(getWarns(chatId, jid(1)), 1);
});

test('le compteur peut atteindre la limite d’expulsion', () => {
  const chatId = nextChat();
  let count = 0;
  for (let i = 0; i < WARN_LIMIT; i += 1) count = addWarn(chatId, jid(1));
  assert.equal(count >= WARN_LIMIT, true);
});
