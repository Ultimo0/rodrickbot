import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// handleAntilink lit la config admin depuis l'environnement et persiste les
// avertissements dans process.cwd() : on fixe les deux avant l'import.
const ADMIN_JID = 'admin@s.whatsapp.net';
process.env.ADMIN_JIDS = ADMIN_JID;
process.chdir(mkdtempSync(path.join(tmpdir(), 'rodrickbot-antilink-')));

const { handleAntilink } = await import('../src/utils/antilink.js');
const { setAntilink } = await import('../src/core/groupSettings.js');
const { WARN_LIMIT, getWarns } = await import('../src/core/warnStore.js');

let seq = 0;
const nextGroup = () => `al-${++seq}@g.us`;
const MEMBER = '33612345678@s.whatsapp.net';

function fakeSock({ groupAdmins = [], metadataError = null, deleteError = null, removeError = null } = {}) {
  const sock = {
    sent: [],
    removed: [],
    async groupMetadata(chatId) {
      if (metadataError) throw metadataError;
      return { id: chatId, participants: groupAdmins.map((id) => ({ id, admin: 'admin' })) };
    },
    async sendMessage(chatId, content) {
      if (deleteError && content.delete) throw deleteError;
      sock.sent.push({ chatId, content });
    },
    async groupParticipantsUpdate(chatId, jids, action) {
      if (removeError) throw removeError;
      sock.removed.push({ chatId, jids, action });
    },
  };
  return sock;
}

const msg = (id = 'MSG1') => ({ key: { id, remoteJid: 'x', fromMe: false } });

test('ignore les messages privés', async () => {
  const sock = fakeSock();
  assert.equal(await handleAntilink(sock, msg(), MEMBER, MEMBER, 'https://exemple.test'), false);
  assert.equal(sock.sent.length, 0);
});

test('ignore les messages sans lien', async () => {
  const chatId = nextGroup();
  setAntilink(chatId, true);
  const sock = fakeSock();

  assert.equal(await handleAntilink(sock, msg(), chatId, MEMBER, 'bonjour tout le monde'), false);
  assert.equal(await handleAntilink(sock, msg(), chatId, MEMBER, ''), false);
  assert.equal(sock.sent.length, 0);
});

test('ignore les liens quand l’antilien est désactivé', async () => {
  const chatId = nextGroup();
  const sock = fakeSock();
  assert.equal(await handleAntilink(sock, msg(), chatId, MEMBER, 'https://exemple.test'), false);
  assert.equal(sock.sent.length, 0);
});

test('épargne les admins du bot et les admins du groupe', async () => {
  const chatId = nextGroup();
  setAntilink(chatId, true);

  const sock = fakeSock({ groupAdmins: [MEMBER] });
  assert.equal(await handleAntilink(sock, msg(), chatId, ADMIN_JID, 'https://exemple.test'), false);
  assert.equal(await handleAntilink(sock, msg(), chatId, MEMBER, 'https://exemple.test'), false);
  assert.equal(sock.sent.length, 0);
});

test('n’agit pas si le statut admin est invérifiable', async () => {
  const chatId = nextGroup();
  setAntilink(chatId, true);

  const sock = fakeSock({ metadataError: new Error('timeout') });
  assert.equal(await handleAntilink(sock, msg(), chatId, MEMBER, 'https://exemple.test'), false);
  assert.equal(sock.sent.length, 0);
});

test('supprime le lien, avertit le membre et le mentionne', async () => {
  const chatId = nextGroup();
  setAntilink(chatId, true);
  const sock = fakeSock();

  assert.equal(await handleAntilink(sock, msg('M1'), chatId, MEMBER, 'regarde www.exemple.test/x'), true);

  assert.deepEqual(sock.sent[0].content.delete, { id: 'M1', remoteJid: 'x', fromMe: false });
  assert.match(sock.sent[1].content.text, /Lien supprimé/);
  assert.match(sock.sent[1].content.text, /@33612345678 averti \(1\/3\)/);
  assert.deepEqual(sock.sent[1].content.mentions, [MEMBER]);
  assert.equal(getWarns(chatId, MEMBER), 1);
});

test('détecte les liens http, www et les invitations de groupe', async () => {
  for (const text of ['http://exemple.test', 'https://exemple.test', 'www.exemple.test', 'chat.whatsapp.com/AbC']) {
    const chatId = nextGroup();
    setAntilink(chatId, true);
    assert.equal(await handleAntilink(fakeSock(), msg(), chatId, MEMBER, text), true, text);
  }
});

test('expulse le membre une fois la limite d’avertissements atteinte', async () => {
  const chatId = nextGroup();
  setAntilink(chatId, true);
  const sock = fakeSock();

  for (let i = 0; i < WARN_LIMIT; i += 1) {
    await handleAntilink(sock, msg(`M${i}`), chatId, MEMBER, 'https://exemple.test');
  }

  assert.deepEqual(sock.removed, [{ chatId, jids: [MEMBER], action: 'remove' }]);
  assert.match(sock.sent.at(-1).content.text, new RegExp(`atteint ${WARN_LIMIT} avertissements`));
});

test('avertit quand même si la suppression du message échoue', async () => {
  const chatId = nextGroup();
  setAntilink(chatId, true);
  const sock = fakeSock({ deleteError: new Error('bot non admin') });

  assert.equal(await handleAntilink(sock, msg(), chatId, MEMBER, 'https://exemple.test'), true);
  assert.match(sock.sent.at(-1).content.text, /Lien supprimé/);
});

test('reste stable si l’expulsion échoue', async () => {
  const chatId = nextGroup();
  setAntilink(chatId, true);
  const sock = fakeSock({ removeError: new Error('bot non admin') });

  for (let i = 0; i < WARN_LIMIT; i += 1) {
    assert.equal(await handleAntilink(sock, msg(`K${i}`), chatId, MEMBER, 'https://exemple.test'), true);
  }
  assert.equal(sock.removed.length, 0);
});
