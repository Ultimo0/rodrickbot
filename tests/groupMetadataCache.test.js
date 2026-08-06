import test from 'node:test';
import assert from 'node:assert/strict';

import { getCachedMetadata, isGroupAdmin } from '../src/utils/groupMetadataCache.js';

let seq = 0;
const nextChat = () => `meta-${++seq}@g.us`;

function fakeSock(participants = []) {
  const sock = {
    calls: 0,
    async groupMetadata(chatId) {
      sock.calls += 1;
      return { id: chatId, participants };
    },
  };
  return sock;
}

test('getCachedMetadata interroge Baileys puis sert le cache', async () => {
  const chatId = nextChat();
  const sock = fakeSock();

  const first = await getCachedMetadata(sock, chatId);
  const second = await getCachedMetadata(sock, chatId);

  assert.equal(sock.calls, 1);
  assert.equal(second, first);
  assert.equal(first.id, chatId);
});

test('le cache est propre à chaque groupe', async () => {
  const sock = fakeSock();
  await getCachedMetadata(sock, nextChat());
  await getCachedMetadata(sock, nextChat());
  assert.equal(sock.calls, 2);
});

test('le cache expire après son TTL', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const chatId = nextChat();
  const sock = fakeSock();

  await getCachedMetadata(sock, chatId);
  t.mock.timers.tick(5 * 60 * 1000 + 1);
  await getCachedMetadata(sock, chatId);

  assert.equal(sock.calls, 2);
});

test('isGroupAdmin reconnaît admin et superadmin', async () => {
  const chatId = nextChat();
  const sock = fakeSock([
    { id: '1@s.whatsapp.net', admin: 'admin' },
    { id: '2@s.whatsapp.net', admin: 'superadmin' },
    { id: '3@s.whatsapp.net', admin: null },
  ]);

  assert.equal(await isGroupAdmin(sock, chatId, '1@s.whatsapp.net'), true);
  assert.equal(await isGroupAdmin(sock, chatId, '2@s.whatsapp.net'), true);
  assert.equal(await isGroupAdmin(sock, chatId, '3@s.whatsapp.net'), false);
});

test('isGroupAdmin retourne false pour un participant absent', async () => {
  const sock = fakeSock([{ id: '1@s.whatsapp.net', admin: 'admin' }]);
  assert.equal(await isGroupAdmin(sock, nextChat(), '404@s.whatsapp.net'), false);
});

test('isGroupAdmin propage les erreurs de Baileys', async () => {
  const sock = {
    groupMetadata: async () => {
      throw new Error('not-authorized');
    },
  };
  await assert.rejects(() => isGroupAdmin(sock, nextChat(), '1@s.whatsapp.net'), /not-authorized/);
});
