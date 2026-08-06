import test from 'node:test';
import assert from 'node:assert/strict';

import { antiSpamMiddleware } from '../src/middlewares/antiSpam.js';
import { middlewares, runMiddlewares } from '../src/middlewares/index.js';

const MAX_REQUESTS = 5;
const WINDOW_MS = 10_000;

let senderSeq = 0;
const nextCtx = () => ({ sender: `user-${++senderSeq}@s.whatsapp.net` });

test('autorise les premières requêtes puis bloque au-delà de la limite', () => {
  const ctx = nextCtx();
  for (let i = 0; i < MAX_REQUESTS; i += 1) {
    assert.equal(antiSpamMiddleware(ctx), true, `requête ${i + 1} devrait passer`);
  }
  assert.equal(antiSpamMiddleware(ctx), false);
  assert.equal(antiSpamMiddleware(ctx), false);
});

test('les compteurs sont indépendants par utilisateur', () => {
  const spammer = nextCtx();
  const other = nextCtx();

  for (let i = 0; i < MAX_REQUESTS; i += 1) antiSpamMiddleware(spammer);
  assert.equal(antiSpamMiddleware(spammer), false);
  assert.equal(antiSpamMiddleware(other), true);
});

test('débloque l’utilisateur après la fenêtre glissante', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const ctx = nextCtx();

  for (let i = 0; i < MAX_REQUESTS; i += 1) antiSpamMiddleware(ctx);
  assert.equal(antiSpamMiddleware(ctx), false);

  t.mock.timers.tick(WINDOW_MS + 1);
  assert.equal(antiSpamMiddleware(ctx), true);
});

test('la fenêtre est glissante, pas fixe', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const ctx = nextCtx();

  for (let i = 0; i < MAX_REQUESTS - 1; i += 1) antiSpamMiddleware(ctx);
  t.mock.timers.tick(WINDOW_MS - 1);
  assert.equal(antiSpamMiddleware(ctx), true, 'la 5e requête reste dans la fenêtre');
  assert.equal(antiSpamMiddleware(ctx), false, 'la 6e requête est bloquée');

  t.mock.timers.tick(2);
  assert.equal(antiSpamMiddleware(ctx), true, 'les anciens horodatages ont expiré');
});

test('runMiddlewares laisse passer un contexte non spammeur', () => {
  assert.equal(runMiddlewares(nextCtx()), true);
});

test('runMiddlewares bloque dès qu’un middleware retourne false', () => {
  const ctx = nextCtx();
  for (let i = 0; i < MAX_REQUESTS; i += 1) runMiddlewares(ctx);
  assert.equal(runMiddlewares(ctx), false);
});

test('la liste des middlewares contient l’anti-spam', () => {
  assert.equal(middlewares.includes(antiSpamMiddleware), true);
});
