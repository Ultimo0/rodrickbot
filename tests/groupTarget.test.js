import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractMentionedJids,
  extractQuotedParticipant,
  numberToJid,
  normalizeJid,
  resolveTargetJids,
  resolveSparedJids,
} from '../src/utils/groupTarget.js';

const withContext = (contextInfo) => ({ message: { extendedTextMessage: { contextInfo } } });

test('extractMentionedJids retourne un tableau vide par défaut', () => {
  assert.deepEqual(extractMentionedJids({}), []);
  assert.deepEqual(extractMentionedJids({ message: {} }), []);
  assert.deepEqual(extractMentionedJids(withContext({})), []);
});

test('extractMentionedJids lit les mentions du contextInfo', () => {
  const msg = withContext({ mentionedJid: ['1@s.whatsapp.net', '2@s.whatsapp.net'] });
  assert.deepEqual(extractMentionedJids(msg), ['1@s.whatsapp.net', '2@s.whatsapp.net']);
});

test('extractQuotedParticipant retourne null sans réponse', () => {
  assert.equal(extractQuotedParticipant({}), null);
  assert.equal(extractQuotedParticipant(withContext({})), null);
});

test('extractQuotedParticipant lit l’auteur du message cité', () => {
  assert.equal(extractQuotedParticipant(withContext({ participant: '7@s.whatsapp.net' })), '7@s.whatsapp.net');
});

test('numberToJid ne garde que les chiffres', () => {
  assert.equal(numberToJid('+33 6 12 34 56 78'), '33612345678@s.whatsapp.net');
  assert.equal(numberToJid('(237) 690-000-000'), '237690000000@s.whatsapp.net');
});

test('normalizeJid retire le suffixe de device', () => {
  assert.equal(normalizeJid('123:9@s.whatsapp.net'), '123@s.whatsapp.net');
  assert.equal(normalizeJid('123@s.whatsapp.net'), '123@s.whatsapp.net');
  assert.equal(normalizeJid('456:2@lid'), '456@lid');
  assert.equal(normalizeJid(null), null);
  assert.equal(normalizeJid(''), '');
});

test('resolveTargetJids privilégie les mentions', () => {
  const ctx = {
    msg: withContext({ mentionedJid: ['1@s.whatsapp.net'], participant: '2@s.whatsapp.net' }),
    args: ['33612345678'],
  };
  assert.deepEqual(resolveTargetJids(ctx), ['1@s.whatsapp.net']);
});

test('resolveTargetJids retombe sur l’auteur du message cité', () => {
  const ctx = { msg: withContext({ participant: '2@s.whatsapp.net' }), args: ['33612345678'] };
  assert.deepEqual(resolveTargetJids(ctx), ['2@s.whatsapp.net']);
});

test('resolveTargetJids retombe sur les numéros en argument', () => {
  const ctx = { msg: { message: {} }, args: ['+33 612345678', 'foo', '12'] };
  assert.deepEqual(resolveTargetJids(ctx), ['33612345678@s.whatsapp.net']);
});

test('resolveTargetJids retourne un tableau vide sans cible exploitable', () => {
  assert.deepEqual(resolveTargetJids({ msg: { message: {} }, args: [] }), []);
  assert.deepEqual(resolveTargetJids({ msg: { message: {} }, args: ['abc', '123'] }), []);
});

test('resolveSparedJids combine toutes les sources et normalise', () => {
  const ctx = {
    msg: withContext({ mentionedJid: ['1:3@s.whatsapp.net'], participant: '2@s.whatsapp.net' }),
    args: ['33612345678', 'ignore'],
  };

  assert.deepEqual(
    [...resolveSparedJids(ctx)].sort(),
    ['1@s.whatsapp.net', '2@s.whatsapp.net', '33612345678@s.whatsapp.net'].sort()
  );
});

test('resolveSparedJids déduplique les doublons', () => {
  const ctx = {
    msg: withContext({ mentionedJid: ['33612345678@s.whatsapp.net'] }),
    args: ['+33612345678'],
  };
  assert.deepEqual([...resolveSparedJids(ctx)], ['33612345678@s.whatsapp.net']);
});

test('resolveSparedJids retourne un Set vide sans source', () => {
  const spared = resolveSparedJids({ msg: { message: {} }, args: [] });
  assert.equal(spared instanceof Set, true);
  assert.equal(spared.size, 0);
});
