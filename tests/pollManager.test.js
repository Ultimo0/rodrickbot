import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const workDir = mkdtempSync(path.join(tmpdir(), 'rodrickbot-poll-manager-'));
process.chdir(workDir);

const PollManager = await import('../src/core/poll/PollManager.js');
const { getPoll, getAllPolls } = await import('../src/core/poll/PollStorage.js');
const { hasDraft, hasDeleteConfirmation } = await import('../src/core/poll/PollSessionManager.js');

let seq = 0;
const nextChat = () => `poll-manager-${++seq}@g.us`;
const jid = (n) => `${n}@s.whatsapp.net`;
let msgSeq = 0;
const nextMsgId = () => `WAMSG${++msgSeq}`;

/** Sock minimal : capture tous les messages envoyés, attribue un id à chaque envoi (comme Baileys). */
function createMockSock() {
  const sent = [];
  return {
    sent,
    sendMessage: async (chatId, content) => {
      const key = { id: nextMsgId(), remoteJid: chatId };
      sent.push({ chatId, content, key });
      return { key };
    },
  };
}

function lastText(sock) {
  return sock.sent[sock.sent.length - 1]?.content?.text;
}

// --- Syntaxe rapide ---------------------------------------------------------

test('quickCreate crée un sondage à partir de la syntaxe rapide du brief', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const rawText = '"Quel langage préférez-vous ?" Python | JavaScript | Java | C++';

  const result = await PollManager.quickCreate(sock, { chatId, sender: jid(1), rawText });

  assert.equal(result.ok, true);
  assert.equal(result.poll.title, 'Quel langage préférez-vous ?');
  assert.deepEqual(result.poll.options.map((o) => o.text), ['Python', 'JavaScript', 'Java', 'C++']);
  assert.equal(result.poll.closesAt, null); // pas de durée fournie
  assert.equal(sock.sent.length, 1); // une seule carte envoyée
  assert.match(lastText(sock), /Python/);
});

test('quickCreate accepte une durée en dernier segment', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const result = await PollManager.quickCreate(sock, {
    chatId, sender: jid(1), rawText: '"Titre" A | B | 1h',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.poll.options.map((o) => o.text), ['A', 'B']); // "1h" retiré des options
  assert.ok(result.poll.closesAt > Date.now());
});

test('quickCreate refuse une syntaxe invalide (moins de 2 options, guillemets manquants...)', async () => {
  const sock = createMockSock();
  const chatId = nextChat();

  const noQuotes = await PollManager.quickCreate(sock, { chatId, sender: jid(1), rawText: 'Titre A | B' });
  assert.equal(noQuotes.ok, false);
  assert.equal(noQuotes.reason, 'INVALID_SYNTAX');

  const oneOption = await PollManager.quickCreate(sock, { chatId, sender: jid(1), rawText: '"Titre" A' });
  assert.equal(oneOption.ok, false);
  assert.equal(oneOption.reason, 'INVALID_SYNTAX');
});

test('quickCreate refuse une durée hors bornes (ex: 999j)', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const result = await PollManager.quickCreate(sock, {
    chatId, sender: jid(1), rawText: '"Titre" A | B | 999j',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'TOO_LONG');
});

// --- Assistant interactif ---------------------------------------------------

test('startWizard puis handleWizardText mènent un utilisateur du titre à la création complète', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = jid(2);

  await PollManager.startWizard(sock, { chatId, sender });
  assert.equal(hasDraft(chatId, sender), true);
  assert.match(lastText(sock), /titre du sondage/);

  await PollManager.handleWizardText(sock, { sender, chatId, text: 'Mon super sondage' });
  assert.match(lastText(sock), /propositions/);

  await PollManager.handleWizardText(sock, { sender, chatId, text: 'Option A' });
  await PollManager.handleWizardText(sock, { sender, chatId, text: 'Option B' });
  await PollManager.handleWizardText(sock, { sender, chatId, text: 'fin' });

  assert.equal(hasDraft(chatId, sender), false); // brouillon consommé
  const created = Object.values(getAllPolls()).find((p) => p.chatId === chatId);
  assert.equal(created.title, 'Mon super sondage');
  assert.deepEqual(created.options.map((o) => o.text), ['Option A', 'Option B']);
});

test('handleWizardText refuse "fin" tant qu\'il n\'y a pas au moins 2 options', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = jid(3);

  await PollManager.startWizard(sock, { chatId, sender });
  await PollManager.handleWizardText(sock, { sender, chatId, text: 'Titre' });
  await PollManager.handleWizardText(sock, { sender, chatId, text: 'Seule option' });
  await PollManager.handleWizardText(sock, { sender, chatId, text: 'fin' });

  assert.match(lastText(sock), /au moins 2 propositions/);
  assert.equal(hasDraft(chatId, sender), true); // brouillon toujours actif
});

test('handleWizardText retourne false (ne consomme rien) si le texte commence par le préfixe de commande', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = jid(4);

  await PollManager.startWizard(sock, { chatId, sender });
  // Le préfixe par défaut du projet est "/" (src/config/settings.json) ;
  // un texte préfixé pendant un brouillon ne doit JAMAIS être avalé comme
  // titre/option (sinon "/poll cancel" serait inaccessible en pleine saisie).
  const handled = await PollManager.handleWizardText(sock, { sender, chatId, text: '/poll cancel' });
  assert.equal(handled, false);
  assert.equal(hasDraft(chatId, sender), true); // brouillon intact, pas consommé par erreur
});

test('handleWizardText retourne false si aucun brouillon n\'est en cours pour cet expéditeur', async () => {
  const sock = createMockSock();
  const handled = await PollManager.handleWizardText(sock, { sender: jid(5), chatId: nextChat(), text: 'Bonjour' });
  assert.equal(handled, false);
});

test('startWizard refuse de démarrer un second brouillon si un premier est déjà en cours', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = jid(6);

  await PollManager.startWizard(sock, { chatId, sender });
  const second = await PollManager.startWizard(sock, { chatId, sender });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'DRAFT_IN_PROGRESS');
});

test('cancelWizard abandonne un brouillon en cours', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = jid(7);

  await PollManager.startWizard(sock, { chatId, sender });
  const result = await PollManager.cancelWizard(sock, { chatId, sender });
  assert.equal(result.ok, true);
  assert.equal(hasDraft(chatId, sender), false);
});

// --- Vote --------------------------------------------------------------------

async function createSamplePoll(sock, chatId, sender) {
  const { poll } = await PollManager.quickCreate(sock, {
    chatId, sender, rawText: '"Titre" Option A | Option B | Option C',
  });
  return poll;
}

test('handleVoteText enregistre un vote valide en réponse à la carte du sondage', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const creator = jid(10);
  const poll = await createSamplePoll(sock, chatId, creator);

  const voter = jid(11);
  const handled = await PollManager.handleVoteText(sock, {
    sender: voter, chatId, messageId: nextMsgId(), text: '2', stanzaId: poll.messageId,
  });

  assert.equal(handled, true);
  assert.equal(getPoll(poll.id).votes[voter], '1'); // option index 1 = "Option B"
  assert.match(lastText(sock), /Option B/);
});

test('handleVoteText permet à un utilisateur de changer son vote', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const poll = await createSamplePoll(sock, chatId, jid(20));
  const voter = jid(21);

  await PollManager.handleVoteText(sock, { sender: voter, chatId, messageId: nextMsgId(), text: '1', stanzaId: poll.messageId });
  await PollManager.handleVoteText(sock, { sender: voter, chatId, messageId: nextMsgId(), text: '3', stanzaId: poll.messageId });

  assert.equal(getPoll(poll.id).votes[voter], '2'); // dernier vote = option 3 (index 2)
  assert.equal(Object.keys(getPoll(poll.id).votes).length, 1); // un seul vote enregistré, pas deux
});

test('handleVoteText retourne false pour une réponse à un message qui n\'est pas une carte de sondage', async () => {
  const sock = createMockSock();
  const handled = await PollManager.handleVoteText(sock, {
    sender: jid(30), chatId: nextChat(), messageId: nextMsgId(), text: '1', stanzaId: 'MESSAGE_QUELCONQUE',
  });
  assert.equal(handled, false);
});

test('handleVoteText retourne false si le texte n\'est pas un chiffre nu (laisse passer le message)', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const poll = await createSamplePoll(sock, chatId, jid(40));

  const handled = await PollManager.handleVoteText(sock, {
    sender: jid(41), chatId, messageId: nextMsgId(), text: 'je vote pour B', stanzaId: poll.messageId,
  });
  assert.equal(handled, false);
  assert.deepEqual(getPoll(poll.id).votes, {});
});

test('handleVoteText refuse un chiffre hors plage (ex: "9" pour 3 options)', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const poll = await createSamplePoll(sock, chatId, jid(50));

  const handled = await PollManager.handleVoteText(sock, {
    sender: jid(51), chatId, messageId: nextMsgId(), text: '9', stanzaId: poll.messageId,
  });
  assert.equal(handled, true); // consommé (c'était bien une tentative de vote), mais rejeté
  assert.deepEqual(getPoll(poll.id).votes, {});
  assert.match(lastText(sock), /entre 1 et 3/);
});

test('handleVoteText refuse tout nouveau vote une fois le sondage fermé', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const creator = jid(60);
  const poll = await createSamplePoll(sock, chatId, creator);

  await PollManager.closePollCommand(sock, { chatId, sender: creator, isAdmin: false, id: poll.id });

  const handled = await PollManager.handleVoteText(sock, {
    sender: jid(61), chatId, messageId: nextMsgId(), text: '1', stanzaId: poll.messageId,
  });
  assert.equal(handled, true);
  assert.deepEqual(getPoll(poll.id).votes, {});
  assert.match(lastText(sock), /fermé/);
});

test('handleVoteText déduplique un même messageId envoyé deux fois (rejeu réseau Baileys)', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const poll = await createSamplePoll(sock, chatId, jid(70));
  const voter = jid(71);
  const duplicatedId = nextMsgId();

  await PollManager.handleVoteText(sock, { sender: voter, chatId, messageId: duplicatedId, text: '1', stanzaId: poll.messageId });
  await PollManager.handleVoteText(sock, { sender: voter, chatId, messageId: duplicatedId, text: '2', stanzaId: poll.messageId });

  // Le deuxième envoi (même messageId) est ignoré : le vote reste sur le premier choix.
  assert.equal(getPoll(poll.id).votes[voter], '0');
});

test('deux votants distincts sur le même sondage ne s\'écrasent jamais mutuellement', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const poll = await createSamplePoll(sock, chatId, jid(80));

  await PollManager.handleVoteText(sock, { sender: jid(81), chatId, messageId: nextMsgId(), text: '1', stanzaId: poll.messageId });
  await PollManager.handleVoteText(sock, { sender: jid(82), chatId, messageId: nextMsgId(), text: '2', stanzaId: poll.messageId });

  const votes = getPoll(poll.id).votes;
  assert.equal(votes[jid(81)], '0');
  assert.equal(votes[jid(82)], '1');
});

// --- Fermeture / permissions -------------------------------------------------

test('closePollCommand est refusé à un utilisateur qui n\'est ni créateur ni admin', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const poll = await createSamplePoll(sock, chatId, jid(90));

  const result = await PollManager.closePollCommand(sock, {
    chatId, sender: jid(91), isAdmin: false, id: poll.id,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'FORBIDDEN');
  assert.equal(getPoll(poll.id).status, 'active'); // inchangé
});

test('closePollCommand est autorisé pour un administrateur même s\'il n\'est pas le créateur', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const poll = await createSamplePoll(sock, chatId, jid(92));

  const result = await PollManager.closePollCommand(sock, {
    chatId, sender: jid(93), isAdmin: true, id: poll.id,
  });
  assert.equal(result.ok, true);
  assert.equal(getPoll(poll.id).status, 'closed');
});

test('closePollCommand refuse de fermer un sondage déjà fermé', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const creator = jid(94);
  const poll = await createSamplePoll(sock, chatId, creator);

  await PollManager.closePollCommand(sock, { chatId, sender: creator, isAdmin: false, id: poll.id });
  const second = await PollManager.closePollCommand(sock, { chatId, sender: creator, isAdmin: false, id: poll.id });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'ALREADY_CLOSED');
});

// --- Suppression avec confirmation ------------------------------------------

test('requestDelete puis handleDeleteConfirmText("1") supprime définitivement le sondage', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const creator = jid(100);
  const poll = await createSamplePoll(sock, chatId, creator);

  await PollManager.requestDelete(sock, { chatId, sender: creator, isAdmin: false, id: poll.id });
  assert.equal(hasDeleteConfirmation(chatId, creator), true);

  const handled = await PollManager.handleDeleteConfirmText(sock, { sender: creator, chatId, text: '1' });
  assert.equal(handled, true);
  assert.equal(getPoll(poll.id), null);
});

test('requestDelete puis handleDeleteConfirmText("2") annule et conserve le sondage intact', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const creator = jid(101);
  const poll = await createSamplePoll(sock, chatId, creator);

  await PollManager.requestDelete(sock, { chatId, sender: creator, isAdmin: false, id: poll.id });
  await PollManager.handleDeleteConfirmText(sock, { sender: creator, chatId, text: '2' });

  assert.ok(getPoll(poll.id)); // toujours là
  assert.equal(hasDeleteConfirmation(chatId, creator), false);
});

test('requestDelete est refusé à un utilisateur qui n\'est ni créateur ni admin', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const poll = await createSamplePoll(sock, chatId, jid(102));

  const result = await PollManager.requestDelete(sock, { chatId, sender: jid(103), isAdmin: false, id: poll.id });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'FORBIDDEN');
});

test('handleDeleteConfirmText retourne false si aucune confirmation n\'est en attente', async () => {
  const handled = await PollManager.handleDeleteConfirmText(createMockSock(), {
    sender: jid(104), chatId: nextChat(), text: '1',
  });
  assert.equal(handled, false);
});

// --- Durée / expiration -------------------------------------------------------

test('setDurationCommand fixe une expiration et referme automatiquement le sondage écoulé (via le timer)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sock = createMockSock();
  const chatId = nextChat();
  const creator = jid(110);
  const poll = await createSamplePoll(sock, chatId, creator);

  const result = await PollManager.setDurationCommand(sock, {
    chatId, sender: creator, isAdmin: false, id: poll.id, durationInput: '10min',
  });
  assert.equal(result.ok, true);
  assert.equal(getPoll(poll.id).status, 'active');

  t.mock.timers.tick(10 * 60 * 1000);
  await Promise.resolve(); // laisse le callback async d'expiration s'exécuter

  assert.equal(getPoll(poll.id).status, 'closed');
  assert.equal(getPoll(poll.id).closedReason, 'expired');
});

test('setDurationCommand refuse une durée invalide', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const creator = jid(111);
  const poll = await createSamplePoll(sock, chatId, creator);

  const result = await PollManager.setDurationCommand(sock, {
    chatId, sender: creator, isAdmin: false, id: poll.id, durationInput: 'pas-une-duree',
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INVALID_SYNTAX');
});

// --- Reprise après redémarrage ------------------------------------------------

test('resumeActivePolls réarme un timer pour chaque sondage actif ayant une expiration future', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const creator = jid(120);
  const withExpiry = await createSamplePoll(sock, chatId, creator);
  await createSamplePoll(sock, chatId, creator); // sans expiration : ne doit pas être compté

  await PollManager.setDurationCommand(sock, {
    chatId, sender: creator, isAdmin: false, id: withExpiry.id, durationInput: '1h',
  });

  const resumed = PollManager.resumeActivePolls(sock);
  assert.ok(resumed >= 1);
});

// --- Lecture seule : résultats / info / liste --------------------------------

test('getResultsMessage renvoie un message dédié pour un id inconnu', () => {
  const msg = PollManager.getResultsMessage(nextChat(), 'inconnu');
  assert.match(msg.text, /Aucun sondage trouvé/);
});

test('getListMessage ne liste que les sondages actifs du chat demandé', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const otherChat = nextChat();
  await createSamplePoll(sock, chatId, jid(130));
  await createSamplePoll(sock, otherChat, jid(131));

  const msg = PollManager.getListMessage(chatId);
  const count = (msg.text.match(/Titre/g) || []).length;
  assert.equal(count, 1);
});
