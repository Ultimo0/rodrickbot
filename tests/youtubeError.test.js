import test from 'node:test';
import assert from 'node:assert/strict';

import { explainYoutubeError } from '../src/utils/youtube.js';

test('explainYoutubeError reformule une erreur 403 en message compréhensible', () => {
  const msg = explainYoutubeError(new Error('ERROR: unable to download video data: HTTP Error 403: Forbidden'));
  assert.match(msg, /YouTube a temporairement bloqué/);
  assert.doesNotMatch(msg, /unable to download video data/); // le jargon technique brut n'est plus montré tel quel
});

test('explainYoutubeError détecte aussi "forbidden" indépendamment de la casse', () => {
  const msg = explainYoutubeError(new Error('Forbidden'));
  assert.match(msg, /YouTube a temporairement bloqué/);
});

test('explainYoutubeError laisse passer tel quel un message d\'erreur sans rapport (ex: durée trop longue)', () => {
  const original = 'Vidéo trop longue (max 20 min).';
  assert.equal(explainYoutubeError(new Error(original)), original);
});

test('explainYoutubeError gère une entrée sans .message (chaîne brute, objet inattendu)', () => {
  assert.doesNotThrow(() => explainYoutubeError('juste une chaîne'));
  assert.doesNotThrow(() => explainYoutubeError({}));
});
