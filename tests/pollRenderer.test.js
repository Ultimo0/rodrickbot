import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderPollCard,
  renderResults,
  renderVoteRecorded,
  renderVoteInvalidNumber,
  renderInfo,
  renderPollList,
  renderDeleteConfirmation,
} from '../src/core/poll/PollRenderer.js';

function samplePoll(overrides = {}) {
  return {
    id: 'abc123',
    chatId: 'group@g.us',
    creatorId: '22500000000@s.whatsapp.net',
    title: 'Quel langage préférez-vous ?',
    options: [
      { id: '0', text: 'Python' },
      { id: '1', text: 'JavaScript' },
      { id: '2', text: 'Java' },
      { id: '3', text: 'C++' },
    ],
    votes: {},
    status: 'active',
    messageId: 'MSG1',
    createdAt: Date.now() - 60_000,
    lastActivityAt: Date.now() - 60_000,
    closesAt: null,
    closedAt: null,
    closedReason: null,
    ...overrides,
  };
}

test('renderPollCard liste toutes les options avec un émoji numéroté', () => {
  const { text } = renderPollCard(samplePoll());
  assert.match(text, /Python/);
  assert.match(text, /JavaScript/);
  assert.match(text, /1\uFE0F\u20E3/); // 1️⃣
  assert.match(text, /Quel langage préférez-vous \?/);
});

test('renderPollCard mentionne le délai restant quand une expiration est fixée', () => {
  const poll = samplePoll({ closesAt: Date.now() + 3_600_000 });
  const { text } = renderPollCard(poll);
  assert.match(text, /Ferme dans/);
});

test('renderResults calcule des pourcentages qui reflètent fidèlement les votes (exemple du brief)', () => {
  // Réplique l'exemple donné dans le brief : Python 55%, JS 30%, Java 10%, C++ 5%
  // sur un total de 20 votes -> 11/6/2/1.
  const poll = samplePoll({
    votes: {
      u1: '0', u2: '0', u3: '0', u4: '0', u5: '0', u6: '0', u7: '0', u8: '0', u9: '0', u10: '0', u11: '0',
      u12: '1', u13: '1', u14: '1', u15: '1', u16: '1', u17: '1',
      u18: '2', u19: '2',
      u20: '3',
    },
  });
  const { text } = renderResults(poll);
  assert.match(text, /55%/);
  assert.match(text, /30%/);
  assert.match(text, /10%/);
  assert.match(text, /5%/);
  assert.match(text, /Total : 20 vote\(s\)/);
});

test('renderResults marque le gagnant avec 🏆 uniquement s\'il y a des votes', () => {
  const noVotes = renderResults(samplePoll()).text;
  assert.doesNotMatch(noVotes, /🏆/);

  const withVotes = renderResults(samplePoll({ votes: { u1: '2' } })).text;
  assert.match(withVotes, /Java 🏆/);
});

test('renderResults affiche 0% pour une option sans aucun vote, sans diviser par zéro', () => {
  const poll = samplePoll({ votes: { u1: '0' } });
  assert.doesNotThrow(() => renderResults(poll));
  const { text } = renderResults(poll);
  assert.match(text, /0%/);
});

test('renderVoteRecorded confirme l\'option choisie par son texte, pas son id', () => {
  const { text } = renderVoteRecorded(samplePoll(), '1');
  assert.match(text, /JavaScript/);
});

test('renderVoteInvalidNumber indique la plage valide selon le nombre réel d\'options', () => {
  const { text } = renderVoteInvalidNumber(samplePoll());
  assert.match(text, /entre 1 et 4/);
});

test('renderInfo affiche les champs demandés par le brief (créateur, date, votants, statut, dernière activité)', () => {
  const { text } = renderInfo(samplePoll({ votes: { u1: '0', u2: '1' } }));
  assert.match(text, /Créateur/);
  assert.match(text, /Créé le/);
  assert.match(text, /Statut/);
  assert.match(text, /Votants : 2/);
  assert.match(text, /Dernière activité/);
});

test('renderPollList affiche un message dédié quand aucun sondage n\'est actif', () => {
  const { text } = renderPollList([]);
  assert.match(text, /Aucun sondage actif/);
});

test('renderPollList liste chaque sondage avec son identifiant court', () => {
  const { text } = renderPollList([samplePoll(), samplePoll({ id: 'def456', title: 'Autre sondage' })]);
  assert.match(text, /#abc123/);
  assert.match(text, /#def456/);
  assert.match(text, /Autre sondage/);
});

test('renderDeleteConfirmation demande explicitement 1 pour confirmer, 2 pour annuler', () => {
  const { text } = renderDeleteConfirmation(samplePoll());
  assert.match(text, /Confirmer la suppression/);
  assert.match(text, /Annuler/);
  assert.match(text, /irréversible/);
});
