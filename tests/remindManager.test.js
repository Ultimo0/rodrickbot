import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const workDir = mkdtempSync(path.join(tmpdir(), 'rodrickbot-remind-manager-'));
process.chdir(workDir);

const RemindManager = await import('../src/core/remind/RemindManager.js');
const { getReminder, getActiveRemindersForUser } = await import('../src/core/remind/RemindStorage.js');
const { hasDraft, hasCancelAllConfirmation, getDraft } = await import('../src/core/remind/RemindSessionManager.js');

let seq = 0;
const nextChat = () => `remind-manager-${++seq}@s.whatsapp.net`;
const user = (n) => `${n}@s.whatsapp.net`;

function createMockSock() {
  const sent = [];
  return {
    sent,
    sendMessage: async (chatId, content) => {
      sent.push({ chatId, content });
      return { key: { id: `MSG${sent.length}` } };
    },
  };
}

function lastText(sock) {
  return sock.sent[sock.sent.length - 1]?.content?.text;
}

// --- parseReminderCommand (logique pure, testée directement) --------------

test('parseReminderCommand reconnaît "10min appeler maman" (exemple exact du brief)', () => {
  const result = RemindManager.parseReminderCommand('10min appeler maman', 'Africa/Douala');
  assert.equal(result.ok, true);
  assert.equal(result.message, 'appeler maman');
  assert.ok(result.scheduledAt > Date.now());
  assert.equal(result.recurrence, null);
});

test('parseReminderCommand reconnaît "2h vérifier mon projet"', () => {
  const result = RemindManager.parseReminderCommand('2h vérifier mon projet', 'Africa/Douala');
  assert.equal(result.ok, true);
  assert.equal(result.message, 'vérifier mon projet');
});

test('parseReminderCommand reconnaît "1d envoyer le document"', () => {
  const result = RemindManager.parseReminderCommand('1d envoyer le document', 'Africa/Douala');
  assert.equal(result.ok, true);
  assert.equal(result.message, 'envoyer le document');
});

test('parseReminderCommand reconnaît "30s boire de l\'eau"', () => {
  const result = RemindManager.parseReminderCommand("30s boire de l'eau", 'Africa/Douala');
  assert.equal(result.ok, true);
  assert.equal(result.message, "boire de l'eau");
});

test('parseReminderCommand reconnaît "demain 08:00 cours"', () => {
  const result = RemindManager.parseReminderCommand('demain 08:00 cours', 'Africa/Douala');
  assert.equal(result.ok, true);
  assert.equal(result.message, 'cours');
});

test('parseReminderCommand reconnaît "20/08/2026 18:30 réunion"', () => {
  const result = RemindManager.parseReminderCommand('20/08/2026 18:30 réunion', 'Africa/Douala', Date.now());
  assert.equal(result.ok, true);
  assert.equal(result.message, 'réunion');
});

test('parseReminderCommand reconnaît la récurrence quotidienne "every day 08:00 ..."', () => {
  const result = RemindManager.parseReminderCommand('every day 08:00 boire de l\'eau', 'Africa/Douala');
  assert.equal(result.ok, true);
  assert.equal(result.recurrence.type, 'daily');
  assert.equal(result.recurrence.time, '08:00');
});

test('parseReminderCommand reconnaît la récurrence hebdomadaire "every week lundi 09:00 ..."', () => {
  const result = RemindManager.parseReminderCommand('every week lundi 09:00 réunion', 'Africa/Douala');
  assert.equal(result.ok, true);
  assert.equal(result.recurrence.type, 'weekly');
  assert.equal(result.recurrence.weekday, 1);
});

test('parseReminderCommand retourne INVALID_SYNTAX pour un texte quelconque, jamais d\'exception', () => {
  assert.doesNotThrow(() => RemindManager.parseReminderCommand('bonjour le monde', 'Africa/Douala'));
  assert.equal(RemindManager.parseReminderCommand('bonjour le monde', 'Africa/Douala').ok, false);
});

test('parseReminderCommand rejette un message vide même avec une durée valide', () => {
  const result = RemindManager.parseReminderCommand('10min', 'Africa/Douala');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'EMPTY_MESSAGE');
});

test('parseReminderCommand distingue "10min" (durée seule, EMPTY_MESSAGE) de "xyz" (aucune durée reconnue, INVALID_SYNTAX)', () => {
  assert.equal(RemindManager.parseReminderCommand('xyz', 'Africa/Douala').reason, 'INVALID_SYNTAX');
  assert.equal(RemindManager.parseReminderCommand('2h', 'Africa/Douala').reason, 'EMPTY_MESSAGE');
});

test('parseReminderCommand rejette une durée hors bornes', () => {
  const result = RemindManager.parseReminderCommand('999j message', 'Africa/Douala');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'TOO_LONG');
});

test('parseReminderCommand rejette un message trop long', () => {
  const longMessage = 'x'.repeat(RemindManager.MAX_MESSAGE_LENGTH + 1);
  const result = RemindManager.parseReminderCommand(`10min ${longMessage}`, 'Africa/Douala');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'MESSAGE_TOO_LONG');
});

// --- createFromText (bout-en-bout avec sock simulé) ------------------------

test('createFromText crée le rappel et envoie la confirmation dans le chat d\'origine', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(1);

  const result = await RemindManager.createFromText(sock, { chatId, sender, rawText: '10min appeler maman' });

  assert.equal(result.ok, true);
  assert.equal(result.reminder.message, 'appeler maman');
  assert.equal(result.reminder.userId, sender);
  assert.match(lastText(sock), /Rappel programmé/);
  assert.match(lastText(sock), /appeler maman/);
});

test('createFromText notifie TOUJOURS le rappel en privé (chatId du rappel = sender), même si tapé en groupe', async () => {
  const sock = createMockSock();
  const groupChatId = 'un-groupe@g.us';
  const sender = user(2);

  const result = await RemindManager.createFromText(sock, { chatId: groupChatId, sender, rawText: '10min test' });

  assert.equal(result.reminder.chatId, sender); // jamais le groupe
});

test('createFromText renvoie une erreur explicite pour une syntaxe invalide, sans planter', async () => {
  const sock = createMockSock();
  const result = await RemindManager.createFromText(sock, { chatId: nextChat(), sender: user(3), rawText: 'n\'importe quoi' });
  assert.equal(result.ok, false);
  assert.match(lastText(sock), /Syntaxe non reconnue/);
});

test('createFromText respecte MAX_ACTIVE_REMINDERS_PER_USER', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(4);

  for (let i = 0; i < RemindManager.MAX_ACTIVE_REMINDERS_PER_USER; i++) {
    const r = await RemindManager.createFromText(sock, { chatId, sender, rawText: `1h message ${i}` });
    assert.equal(r.ok, true, `création ${i} aurait dû réussir`);
  }

  const overLimit = await RemindManager.createFromText(sock, { chatId, sender, rawText: '1h de trop' });
  assert.equal(overLimit.ok, false);
  assert.equal(overLimit.reason, 'LIMIT_REACHED');
  assert.equal(getActiveRemindersForUser(sender).length, RemindManager.MAX_ACTIVE_REMINDERS_PER_USER);
});

test('createFromText avec récurrence crée un rappel qui reste actif après programmation (pas encore envoyé)', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(5);
  const result = await RemindManager.createFromText(sock, { chatId, sender, rawText: 'every day 08:00 boire de l\'eau' });
  assert.equal(result.ok, true);
  assert.equal(result.reminder.recurrence.type, 'daily');
  assert.equal(result.reminder.status, 'pending');
});

// --- Assistant interactif --------------------------------------------------

test('startWizard affiche le menu 1-4 et initialise un brouillon', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(10);
  await RemindManager.startWizard(sock, { chatId, sender });
  assert.equal(hasDraft(chatId, sender), true);
  assert.match(lastText(sock), /1️⃣/);
});

test('startWizard refuse un second brouillon si un premier est en cours', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(11);
  await RemindManager.startWizard(sock, { chatId, sender });
  const second = await RemindManager.startWizard(sock, { chatId, sender });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'DRAFT_IN_PROGRESS');
});

test('assistant complet : choix "1" (10 minutes) puis message -> rappel créé', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(12);

  await RemindManager.startWizard(sock, { chatId, sender });
  const step1 = await RemindManager.handleWizardText(sock, { sender, chatId, text: '1' });
  assert.equal(step1, true);
  assert.match(lastText(sock), /rappel/i);

  const step2 = await RemindManager.handleWizardText(sock, { sender, chatId, text: 'Appeler maman' });
  assert.equal(step2, true);
  assert.equal(hasDraft(chatId, sender), false);

  const reminders = getActiveRemindersForUser(sender);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].message, 'Appeler maman');
  assert.ok(reminders[0].scheduledAt <= Date.now() + 10 * 60 * 1000 + 1000);
});

test('assistant : choix "4" demande une durée personnalisée avant le message', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(13);

  await RemindManager.startWizard(sock, { chatId, sender });
  await RemindManager.handleWizardText(sock, { sender, chatId, text: '4' });
  assert.match(lastText(sock), /combien de temps/i);

  await RemindManager.handleWizardText(sock, { sender, chatId, text: '3j' });
  assert.match(lastText(sock), /rappel/i);

  await RemindManager.handleWizardText(sock, { sender, chatId, text: 'Anniversaire' });
  const reminders = getActiveRemindersForUser(sender);
  assert.equal(reminders[reminders.length - 1].message, 'Anniversaire');
});

test('assistant : un choix de menu invalide (ex: "9") redemande sans planter ni avancer l\'étape', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(14);
  await RemindManager.startWizard(sock, { chatId, sender });
  const handled = await RemindManager.handleWizardText(sock, { sender, chatId, text: '9' });
  assert.equal(handled, true);
  assert.match(lastText(sock), /1 et 4/);
  assert.equal(getDraftStep(chatId, sender), 'menu');
});

test('assistant : un message vide à l\'étape "message" est refusé et redemandé', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(15);
  await RemindManager.startWizard(sock, { chatId, sender });
  await RemindManager.handleWizardText(sock, { sender, chatId, text: '2' });
  const handled = await RemindManager.handleWizardText(sock, { sender, chatId, text: '   ' });
  assert.equal(handled, true);
  assert.match(lastText(sock), /vide/);
  assert.equal(hasDraft(chatId, sender), true); // toujours en cours
});

test('assistant : un texte préfixé par le préfixe de commande n\'est jamais avalé comme réponse d\'étape', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(16);
  await RemindManager.startWizard(sock, { chatId, sender });
  const handled = await RemindManager.handleWizardText(sock, { sender, chatId, text: '/remind cancel' });
  assert.equal(handled, false);
  assert.equal(hasDraft(chatId, sender), true); // brouillon intact
});

test('handleWizardText retourne false si aucun brouillon n\'est en cours pour cet expéditeur', async () => {
  const sock = createMockSock();
  const handled = await RemindManager.handleWizardText(sock, { sender: user(17), chatId: nextChat(), text: 'Bonjour' });
  assert.equal(handled, false);
});

test('cancelWizard abandonne un brouillon en cours', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(18);
  await RemindManager.startWizard(sock, { chatId, sender });
  const result = await RemindManager.cancelWizard(sock, { chatId, sender });
  assert.equal(result.ok, true);
  assert.equal(hasDraft(chatId, sender), false);
});

test('assistant : la limite MAX_ACTIVE_REMINDERS_PER_USER est aussi appliquée à l\'étape finale', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(19);

  for (let i = 0; i < RemindManager.MAX_ACTIVE_REMINDERS_PER_USER; i++) {
    await RemindManager.createFromText(sock, { chatId, sender, rawText: `1h message ${i}` });
  }

  await RemindManager.startWizard(sock, { chatId, sender });
  await RemindManager.handleWizardText(sock, { sender, chatId, text: '1' });
  await RemindManager.handleWizardText(sock, { sender, chatId, text: 'De trop' });

  assert.match(lastText(sock), /maximum autorisé/);
  assert.equal(hasDraft(chatId, sender), false); // le brouillon a bien été nettoyé, pas laissé en suspens
});

// petite aide locale pour inspecter l'étape du brouillon en cours
function getDraftStep(chatId, sender) {
  return getDraft(chatId, sender)?.step;
}

// --- Annulation -------------------------------------------------------------

test('cancelById annule un rappel appartenant à l\'expéditeur', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(20);
  const { reminder } = await RemindManager.createFromText(sock, { chatId, sender, rawText: '1h test' });

  const result = await RemindManager.cancelById(sock, { chatId, sender, id: reminder.id });
  assert.equal(result.ok, true);
  assert.equal(getReminder(reminder.id).status, 'cancelled');
});

test('cancelById refuse d\'annuler le rappel d\'un autre utilisateur', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const owner = user(21);
  const attacker = user(22);
  const { reminder } = await RemindManager.createFromText(sock, { chatId, sender: owner, rawText: '1h test' });

  const result = await RemindManager.cancelById(sock, { chatId, sender: attacker, id: reminder.id });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'NOT_FOUND'); // volontairement pas "FORBIDDEN" : ne révèle même pas que l'id existe
  assert.equal(getReminder(reminder.id).status, 'pending'); // inchangé
});

test('cancelById sur un id inconnu retourne NOT_FOUND sans planter', async () => {
  const sock = createMockSock();
  const result = await RemindManager.cancelById(sock, { chatId: nextChat(), sender: user(23), id: 'inconnu' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'NOT_FOUND');
});

test('cancelById sur un rappel déjà annulé refuse proprement', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(24);
  const { reminder } = await RemindManager.createFromText(sock, { chatId, sender, rawText: '1h test' });
  await RemindManager.cancelById(sock, { chatId, sender, id: reminder.id });
  const second = await RemindManager.cancelById(sock, { chatId, sender, id: reminder.id });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'NOT_PENDING');
});

test('requestCancelAll puis confirmation "1" annule tous les rappels actifs', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(25);
  await RemindManager.createFromText(sock, { chatId, sender, rawText: '1h premier' });
  await RemindManager.createFromText(sock, { chatId, sender, rawText: '2h deuxième' });

  await RemindManager.requestCancelAll(sock, { chatId, sender });
  assert.equal(hasCancelAllConfirmation(chatId, sender), true);

  const handled = await RemindManager.handleCancelAllConfirmText(sock, { sender, chatId, text: '1' });
  assert.equal(handled, true);
  assert.equal(getActiveRemindersForUser(sender).length, 0);
});

test('requestCancelAll puis confirmation "2" conserve tous les rappels', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(26);
  await RemindManager.createFromText(sock, { chatId, sender, rawText: '1h premier' });

  await RemindManager.requestCancelAll(sock, { chatId, sender });
  await RemindManager.handleCancelAllConfirmText(sock, { sender, chatId, text: '2' });

  assert.equal(getActiveRemindersForUser(sender).length, 1);
  assert.equal(hasCancelAllConfirmation(chatId, sender), false);
});

test('requestCancelAll refuse s\'il n\'y a aucun rappel actif', async () => {
  const sock = createMockSock();
  const result = await RemindManager.requestCancelAll(sock, { chatId: nextChat(), sender: user(27) });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'NONE_ACTIVE');
});

test('handleCancelAllConfirmText retourne false si aucune confirmation n\'est en attente', async () => {
  const sock = createMockSock();
  const handled = await RemindManager.handleCancelAllConfirmText(sock, { sender: user(28), chatId: nextChat(), text: '1' });
  assert.equal(handled, false);
});

// --- Livraison (deliverDueReminder / expireDueReminder) --------------------

test('deliverDueReminder envoie le message de rappel et marque "sent" pour un rappel non récurrent', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(30);
  const { reminder } = await RemindManager.createFromText(sock, { chatId, sender, rawText: '1h test livraison' });

  const result = await RemindManager.deliverDueReminder(sock, reminder);
  assert.equal(result, 'sent');
  assert.equal(getReminder(reminder.id).status, 'sent');
  assert.match(lastText(sock), /RAPPEL/);
});

test('deliverDueReminder REPROGRAMME (reste "pending") pour un rappel récurrent', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(31);
  const { reminder } = await RemindManager.createFromText(sock, { chatId, sender, rawText: 'every day 08:00 routine' });

  const result = await RemindManager.deliverDueReminder(sock, reminder);
  assert.equal(result, 'recurred');
  const updated = getReminder(reminder.id);
  assert.equal(updated.status, 'pending'); // jamais "sent" définitif pour un récurrent
  assert.ok(updated.scheduledAt > Date.now()); // la prochaine occurrence est bien dans le futur
  assert.ok(updated.lastSentAt); // trace que ce passage a bien eu lieu
});

test('deliverDueReminder gère un échec d\'envoi (téléphone hors ligne) sans planter, laisse le rappel "pending"', async () => {
  const chatId = nextChat();
  const sender = user(32);
  const workingSock = createMockSock();
  const { reminder } = await RemindManager.createFromText(workingSock, { chatId, sender, rawText: '1h test panne' });

  const brokenSock = { sendMessage: async () => { throw new Error('Socket déconnecté'); } };
  const result = await RemindManager.deliverDueReminder(brokenSock, reminder);
  assert.equal(result, 'retry');
  assert.equal(getReminder(reminder.id).status, 'pending'); // pas perdu, sera retenté
});

test('expireDueReminder marque le rappel "expired" sans envoyer de message', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const sender = user(33);
  const { reminder } = await RemindManager.createFromText(sock, { chatId, sender, rawText: '1h test expiration' });

  const sentBefore = sock.sent.length;
  RemindManager.expireDueReminder(reminder);
  assert.equal(getReminder(reminder.id).status, 'expired');
  assert.equal(sock.sent.length, sentBefore); // rien envoyé de plus
});

// --- Lecture seule : liste / info -------------------------------------------

test('getListMessage ne montre que les rappels actifs de CET utilisateur', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const userA = user(40);
  const userB = user(41);
  await RemindManager.createFromText(sock, { chatId, sender: userA, rawText: '1h pour A' });
  await RemindManager.createFromText(sock, { chatId, sender: userB, rawText: '1h pour B' });

  const msg = getListMessageSafely(userA);
  assert.match(msg.text, /pour A/);
  assert.doesNotMatch(msg.text, /pour B/);
});

function getListMessageSafely(sender) {
  return RemindManager.getListMessage(sender);
}

test('getInfoMessage refuse de révéler un rappel appartenant à un autre utilisateur', async () => {
  const sock = createMockSock();
  const chatId = nextChat();
  const owner = user(42);
  const other = user(43);
  const { reminder } = await RemindManager.createFromText(sock, { chatId, sender: owner, rawText: '1h privé' });

  const msg = RemindManager.getInfoMessage(other, reminder.id);
  assert.match(msg.text, /introuvable/);
});
