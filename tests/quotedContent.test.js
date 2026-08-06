import test from 'node:test';
import assert from 'node:assert/strict';

import { getMediaType, getMediaObject, getTextContent, getQuotedInfo } from '../src/utils/quotedContent.js';

test('getMediaType reconnaît chaque type de média', () => {
  assert.equal(getMediaType({ imageMessage: {} }), 'image');
  assert.equal(getMediaType({ videoMessage: {} }), 'video');
  assert.equal(getMediaType({ audioMessage: {} }), 'audio');
  assert.equal(getMediaType({ stickerMessage: {} }), 'sticker');
  assert.equal(getMediaType({ documentMessage: {} }), 'document');
  assert.equal(getMediaType({ conversation: 'texte' }), null);
});

test('getMediaType déballe les enveloppes viewOnce et documentWithCaption', () => {
  assert.equal(getMediaType({ viewOnceMessage: { message: { imageMessage: {} } } }), 'image');
  assert.equal(getMediaType({ viewOnceMessageV2: { message: { videoMessage: {} } } }), 'video');
  assert.equal(
    getMediaType({ documentWithCaptionMessage: { message: { documentMessage: {} } } }),
    'document'
  );
});

test('getMediaObject retourne le nœud média demandé', () => {
  const image = { url: 'https://example.test/i.jpg' };
  assert.equal(getMediaObject({ imageMessage: image }, 'image'), image);
  assert.equal(getMediaObject({ viewOnceMessageV2: { message: { imageMessage: image } } }, 'image'), image);
  assert.equal(getMediaObject({ imageMessage: image }, 'video'), null);
});

test('getTextContent retourne null sans message', () => {
  assert.equal(getTextContent(null), null);
  assert.equal(getTextContent(undefined), null);
  assert.equal(getTextContent({}), null);
});

test('getTextContent lit les porteurs de texte simples', () => {
  assert.equal(getTextContent({ conversation: 'salut' }), 'salut');
  assert.equal(getTextContent({ extendedTextMessage: { text: 'salut' } }), 'salut');
  assert.equal(getTextContent({ imageMessage: { caption: 'photo' } }), 'photo');
  assert.equal(getTextContent({ videoMessage: { caption: 'video' } }), 'video');
  assert.equal(getTextContent({ audioMessage: { caption: 'audio' } }), 'audio');
  assert.equal(getTextContent({ documentMessage: { caption: 'doc' } }), 'doc');
  assert.equal(getTextContent({ stickerMessage: { caption: 'sticker' } }), 'sticker');
});

test('getTextContent lit les contacts, listes et boutons', () => {
  assert.equal(getTextContent({ contactMessage: { displayName: 'Alice' } }), 'Alice');
  assert.equal(
    getTextContent({ contactsArrayMessage: { contacts: [{ displayName: 'A' }, { displayName: 'B' }] } }),
    'A, B'
  );
  assert.equal(getTextContent({ listMessage: { title: 'Menu' } }), 'Menu');
  assert.equal(getTextContent({ buttonsMessage: { contentText: 'Choisis' } }), 'Choisis');
  assert.equal(getTextContent({ templateButtonReplyMessage: { selectedDisplayText: 'Oui' } }), 'Oui');
  assert.equal(
    getTextContent({ listResponseMessage: { singleSelectReply: { selectedRowId: '!ping' } } }),
    '!ping'
  );
});

test('getTextContent déballe les enveloppes imbriquées', () => {
  assert.equal(
    getTextContent({ viewOnceMessage: { message: { viewOnceMessageV2: { message: { conversation: 'x' } } } } }),
    'x'
  );
  assert.equal(
    getTextContent({ documentWithCaptionMessage: { message: { documentMessage: { caption: 'legende' } } } }),
    'legende'
  );
});

test('getTextContent descend récursivement dans le message cité', () => {
  assert.equal(
    getTextContent({ extendedTextMessage: { contextInfo: { quotedMessage: { conversation: 'cité' } } } }),
    'cité'
  );
  assert.equal(getTextContent({ contextInfo: { quotedMessage: { conversation: 'cité' } } }), 'cité');
});

test('getQuotedInfo retourne null sans message cité', () => {
  assert.equal(getQuotedInfo(null), null);
  assert.equal(getQuotedInfo({}), null);
  assert.equal(getQuotedInfo({ message: {} }), null);
  assert.equal(getQuotedInfo({ message: { extendedTextMessage: { contextInfo: {} } } }), null);
});

test('getQuotedInfo lit la structure extendedTextMessage standard', () => {
  const quotedMessage = { conversation: 'original' };
  const info = getQuotedInfo({
    message: {
      extendedTextMessage: {
        contextInfo: { quotedMessage, stanzaId: 'ID1', participant: '1@s.whatsapp.net' },
      },
    },
  });
  assert.deepEqual(info, { quotedMessage, stanzaId: 'ID1', participant: '1@s.whatsapp.net' });
});

test('getQuotedInfo gère les structures alternatives', () => {
  const quotedMessage = { conversation: 'original' };
  const variants = [
    { contextInfo: { quotedMessage, stanzaId: 'A' } },
    { imageMessage: { contextInfo: { quotedMessage, stanzaId: 'B' } } },
    {
      viewOnceMessage: {
        message: { extendedTextMessage: { contextInfo: { quotedMessage, stanzaId: 'C' } } },
      },
    },
    { documentMessage: { contextInfo: { quotedMessage, stanzaId: 'D' } } },
  ];

  for (const message of variants) {
    const info = getQuotedInfo({ message });
    assert.equal(info.quotedMessage, quotedMessage);
    assert.equal(typeof info.stanzaId, 'string');
  }
});
