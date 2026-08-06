import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Le module écrit group_settings.json dans process.cwd() : on isole donc les
// tests dans un dossier temporaire avant de l'importer.
const workDir = mkdtempSync(path.join(tmpdir(), 'rodrickbot-group-settings-'));
process.chdir(workDir);

const { getGroupSettings, setWelcome, setBye, setAntilink } = await import('../src/core/groupSettings.js');

const DATA_FILE = path.join(workDir, 'group_settings.json');
const readPersisted = () => JSON.parse(readFileSync(DATA_FILE, 'utf-8'));

let seq = 0;
const nextChat = () => `gs-${++seq}@g.us`;

test('getGroupSettings retourne les valeurs par défaut pour un groupe inconnu', () => {
  assert.deepEqual(getGroupSettings(nextChat()), {
    welcome: { enabled: false, message: null },
    bye: { enabled: false, message: null },
    antilink: { enabled: false },
  });
});

test('getGroupSettings retourne une copie, non la référence interne', () => {
  const chatId = nextChat();
  const first = getGroupSettings(chatId);
  first.antilink.enabled = true;
  assert.equal(getGroupSettings(chatId).antilink.enabled, false);
});

test('setWelcome active le message de bienvenue et le persiste', () => {
  const chatId = nextChat();
  setWelcome(chatId, true, 'Bienvenue !');

  assert.deepEqual(getGroupSettings(chatId).welcome, { enabled: true, message: 'Bienvenue !' });
  assert.deepEqual(readPersisted()[chatId].welcome, { enabled: true, message: 'Bienvenue !' });
});

test('setWelcome sans message conserve le message existant', () => {
  const chatId = nextChat();
  setWelcome(chatId, true, 'Salut');
  setWelcome(chatId, false);

  assert.deepEqual(getGroupSettings(chatId).welcome, { enabled: false, message: 'Salut' });
});

test('setBye est indépendant de setWelcome', () => {
  const chatId = nextChat();
  setBye(chatId, true, 'Au revoir');

  const settings = getGroupSettings(chatId);
  assert.deepEqual(settings.bye, { enabled: true, message: 'Au revoir' });
  assert.deepEqual(settings.welcome, { enabled: false, message: null });
});

test('setBye sans message conserve le message existant', () => {
  const chatId = nextChat();
  setBye(chatId, true, 'Ciao');
  setBye(chatId, false);

  assert.deepEqual(getGroupSettings(chatId).bye, { enabled: false, message: 'Ciao' });
});

test('setAntilink bascule l’antilien', () => {
  const chatId = nextChat();
  setAntilink(chatId, true);
  assert.deepEqual(getGroupSettings(chatId).antilink, { enabled: true });

  setAntilink(chatId, false);
  assert.deepEqual(getGroupSettings(chatId).antilink, { enabled: false });
});

test('les réglages sont isolés par groupe', () => {
  const a = nextChat();
  const b = nextChat();
  setAntilink(a, true);

  assert.equal(getGroupSettings(a).antilink.enabled, true);
  assert.equal(getGroupSettings(b).antilink.enabled, false);
});

test('le fichier de persistance est créé au premier écrit', () => {
  assert.equal(existsSync(DATA_FILE), true);
});
