import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractText,
  isGroup,
  parseCommand,
  toQuoteBlock,
  groupByCategory,
  formatUptime,
} from '../src/utils/helpers.js';

test('extractText retourne une chaîne vide sans contenu', () => {
  assert.equal(extractText({}), '');
  assert.equal(extractText({ message: null }), '');
  assert.equal(extractText({ message: {} }), '');
});

test('extractText lit les différents porteurs de texte', () => {
  assert.equal(extractText({ message: { conversation: 'salut' } }), 'salut');
  assert.equal(extractText({ message: { extendedTextMessage: { text: '!ping' } } }), '!ping');
  assert.equal(extractText({ message: { imageMessage: { caption: 'photo' } } }), 'photo');
  assert.equal(extractText({ message: { videoMessage: { caption: 'video' } } }), 'video');
  assert.equal(extractText({ message: { documentMessage: { caption: 'doc' } } }), 'doc');
  assert.equal(
    extractText({
      message: { documentWithCaptionMessage: { message: { documentMessage: { caption: 'wrapped' } } } },
    }),
    'wrapped'
  );
  assert.equal(
    extractText({ message: { listResponseMessage: { singleSelectReply: { selectedRowId: '!menu' } } } }),
    '!menu'
  );
});

test('extractText privilégie conversation sur les légendes', () => {
  const msg = { message: { conversation: 'texte', imageMessage: { caption: 'legende' } } };
  assert.equal(extractText(msg), 'texte');
});

test('isGroup distingue groupes et discussions privées', () => {
  assert.equal(isGroup('123456@g.us'), true);
  assert.equal(isGroup('123456@s.whatsapp.net'), false);
  assert.equal(isGroup('123456@lid'), false);
});

test('parseCommand renvoie null hors préfixe', () => {
  assert.equal(parseCommand('ping', '!'), null);
  assert.equal(parseCommand('', '!'), null);
  assert.equal(parseCommand(undefined, '!'), null);
});

test('parseCommand sépare commande et arguments', () => {
  assert.deepEqual(parseCommand('!ping', '!'), { command: 'ping', args: [] });
  assert.deepEqual(parseCommand('!PING Foo bar', '!'), { command: 'ping', args: ['Foo', 'bar'] });
  assert.deepEqual(parseCommand('!kick   a    b  ', '!'), { command: 'kick', args: ['a', 'b'] });
});

test('parseCommand accepte un préfixe multi-caractères', () => {
  assert.deepEqual(parseCommand('/bot!ping x', '/bot!'), { command: 'ping', args: ['x'] });
});

test('toQuoteBlock préfixe chaque ligne sans doubler les citations', () => {
  assert.equal(toQuoteBlock('a\nb'), '> a\n> b');
  assert.equal(toQuoteBlock('> déjà cité'), '> déjà cité');
  assert.equal(toQuoteBlock('a\n> b'), '> a\n> b');
  assert.equal(toQuoteBlock(''), '> ');
});

test('groupByCategory regroupe dans l’ordre d’apparition et gère le défaut', () => {
  const groups = groupByCategory([
    { name: 'ping', category: 'Utilitaires' },
    { name: 'kick', category: 'Groupe' },
    { name: 'help' },
    { name: 'status', category: 'Utilitaires' },
  ]);

  assert.deepEqual([...groups.keys()], ['Utilitaires', 'Groupe', 'Général']);
  assert.deepEqual(
    groups.get('Utilitaires').map((c) => c.name),
    ['ping', 'status']
  );
  assert.deepEqual(
    groups.get('Général').map((c) => c.name),
    ['help']
  );
});

test('groupByCategory sur une liste vide', () => {
  assert.equal(groupByCategory([]).size, 0);
});

test('formatUptime affiche toujours les secondes et omet les unités nulles', () => {
  assert.equal(formatUptime(0), '0s');
  assert.equal(formatUptime(5), '5s');
  assert.equal(formatUptime(65), '1min 5s');
  assert.equal(formatUptime(3600), '1h 0s');
  assert.equal(formatUptime(86400 * 2 + 3600 * 3 + 60 * 14 + 5), '2j 3h 14min 5s');
});

test('formatUptime tronque les secondes fractionnaires', () => {
  assert.equal(formatUptime(9.9), '9s');
});
