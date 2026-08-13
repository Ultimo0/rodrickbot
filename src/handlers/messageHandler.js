import { config, isAdmin } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { extractText, isGroup, parseCommand, toQuoteBlock } from '../utils/helpers.js';
import { runMiddlewares } from '../middlewares/index.js';
import { attachReplyHelpers } from '../utils/reply.js';
import { isLockdownMode, incrementMessageCount, incrementCommandCount } from '../core/state.js';
import { isRemotelyDisabled } from '../core/remoteControl.js';
import { handleAntilink } from '../utils/antilink.js';
import { handleAntistatut } from '../utils/antistatut.js';
import { handleDownloadReply } from '../utils/downloadReply.js';
import { isInstanceConfigured } from '../core/instance.js';
import { runAgentTurn } from '../agent/index.js';
import { handleAnswerText, hasActiveSession } from '../core/quiz/QuizEngine.js';
import { handleTextReply, hasPendingReset, handleGlobalTextReply, hasPendingGlobalReset } from '../core/quiz/QuizResetService.js';
import { handleAnswerText as handleCalcAnswerText, hasActiveSession as hasActiveCalcSession } from '../core/calc/CalcEngine.js';

export function createMessageHandler(sock, commands) {
  return async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleSingleMessage(sock, commands, msg);
      } catch (err) {
        logger.error({ err }, 'Erreur lors du traitement d\'un message');
        // Avant ce correctif, une exception ici (ex: structure de statut
        // WhatsApp inattendue, échec Baileys) restait invisible pour
        // l'utilisateur : aucune réponse dans le chat, uniquement un log
        // serveur. Symptôme rapporté : "le bot ne répond rien du tout".
        // On tente désormais un message d'erreur best-effort dans le chat
        // d'origine, pour qu'un plantage inattendu ne se traduise plus
        // jamais par un silence total côté utilisateur.
        try {
          const chatId = msg?.key?.remoteJid;
          if (chatId) {
            await sock.sendMessage(chatId, {
              text: '❌ Une erreur inattendue est survenue lors du traitement de ce message. Réessaie, ou contacte le développeur si ça persiste.',
            }, { quoted: msg });
          }
        } catch (notifyErr) {
          logger.error({ notifyErr }, "Impossible d'envoyer le message d'erreur de secours");
        }
      }
    }
  };
}

async function handleSingleMessage(sock, commands, msg) {
  if (!msg.message) return;

  // Interrupteur à distance
  if (isRemotelyDisabled()) return;

  // fromMe = message envoyé depuis le compte du bot lui-même. Comme le bot
  // tourne sur le compte personnel du propriétaire, ça inclut aussi bien ses
  // messages de test en privé que ses propres commandes tapées en groupe —
  // les deux doivent être traités (contrairement aux messages fromMe qui
  // seraient de simples échos des propres envois du bot, filtrés plus loin
  // par le fait qu'ils ne matchent pas le préfixe de commande).
  const isSelfTest = msg.key.fromMe && config.allowSelfTest;
  if (msg.key.fromMe && !isSelfTest) return;

  const chatId = msg.key.remoteJid;
  const sender = isGroup(chatId) ? msg.key.participant : chatId;

  // Vérifié avant extractText() : une notification de mention de statut
  // n'est ni un `conversation` ni un `extendedTextMessage`, donc `text`
  // serait vide de toute façon — inutile d'attendre son extraction.
  if (await handleAntistatut(sock, msg, chatId)) return;

  const text = extractText(msg);

  // Quiz : un chiffre nu envoyé par un utilisateur qui a une confirmation
  // de reset (personnel ou global) ou un quiz en cours est traité ici,
  // AVANT parseCommand() — "2" ne commence jamais par le préfixe donc ne
  // matcherait aucune commande de toute façon, et tomberait sinon dans la
  // branche Agent IA. handle*Reply()/handleAnswerText() renvoient false si
  // le texte n'était PAS un chiffre pertinent (ex: l'utilisateur tape
  // "/quiz abandonner" en pleine partie) : dans ce cas on continue le
  // pipeline normalement, sans quoi une vraie commande serait avalée
  // silencieusement. Le reset global (admin) est vérifié en premier : c'est
  // le cas le plus rare et le plus destructeur, il ne doit jamais être
  // masqué par un reset personnel ou une session qui traînerait pour le
  // même utilisateur (impossible en pratique, /quiz les rend exclusifs,
  // mais l'ordre de vérification reste le plus sûr par défaut). Le calcul
  // mental (CalcEngine) suit exactement le même contrat renvoyant false —
  // /quiz et /calcul s'excluent mutuellement (voir commands/quiz.js et
  // commands/calcul.js), donc jamais les deux actifs en même temps pour un
  // même utilisateur : l'ordre entre les deux blocs ci-dessous ne crée pas
  // d'ambiguïté réelle, seulement une garde de sécurité par défaut.
  if (!(isLockdownMode() && !(isSelfTest || isAdmin(sender)))) {
    if (hasPendingGlobalReset(sender)) {
      const handled = await handleGlobalTextReply(sock, { sender, chatId, messageId: msg.key.id, text });
      if (handled) return;
    } else if (hasPendingReset(sender)) {
      const handled = await handleTextReply(sock, { sender, chatId, messageId: msg.key.id, text });
      if (handled) return;
    } else if (hasActiveSession(sender)) {
      const handled = await handleAnswerText(sock, { sender, chatId, messageId: msg.key.id, text });
      if (handled) return;
    } else if (hasActiveCalcSession(sender)) {
      const handled = await handleCalcAnswerText(sock, { sender, chatId, messageId: msg.key.id, text });
      if (handled) return;
    }
  }

  if (await handleAntilink(sock, msg, chatId, sender, text)) return;
  if (await handleDownloadReply(sock, chatId, sender, text, msg)) return;

  const parsed = parseCommand(text, config.prefix);
  if (!parsed) {
    // Agent IA réservé aux admins (ADMIN_JIDS) : ignoré silencieusement pour
    // les autres, même si la session a été activée via !agent on — même
    // logique de blocage silencieux que le lockdown mode (voir plus bas
    // pour les commandes classiques), pour ne pas laisser deviner à un
    // non-admin que le mode existe.
    if (!(isSelfTest || isAdmin(sender))) return;

    const agentHandled = await runAgentTurn(sock, msg, chatId, sender, text, commands);
    if (agentHandled) {
      incrementMessageCount();
      logger.info(`Agent IA exécuté pour ${sender}`);
    }
    return;
  }

  const command = commands.get(parsed.command);
  if (!command) return;

  const ctx = {
    sock,
    msg,
    chatId,
    sender,
    args: parsed.args,
    isGroup: isGroup(chatId),
    isAdmin: isSelfTest || isAdmin(sender),
    commands,
    reply: (content) => {
      const formatted =
        typeof content === 'object' && typeof content.text === 'string'
          ? { ...content, text: toQuoteBlock(content.text) }
          : content;
      return sock.sendMessage(chatId, formatted, { quoted: msg });
    },
  };
  attachReplyHelpers(ctx);

  if (!isInstanceConfigured() && command.name !== 'setup') {
    await ctx.error(
      "⚠️ Ce bot n'est pas encore configuré.\n\n" +
      "Exécute d'abord :\n!setup <identifiant> <propriétaire>\n\n" +
      "Exemple : !setup boutique-jean Jean Dupont"
    );
    return;
  }

  if (isLockdownMode() && !ctx.isAdmin) {
    logger.debug(`Commande ignorée (mode privé strict actif): ${sender}`);
    return;
  }

  if (!runMiddlewares(ctx)) {
    logger.debug(`Message bloqué par un middleware: ${sender}`);
    return;
  }

  const isPrivateOnly = command.privateOnly !== false;
  if (isPrivateOnly && ctx.isGroup) {
    await ctx.error('Cette commande fonctionne uniquement en message privé.');
    return;
  }

  if (command.adminOnly && !ctx.isAdmin) {
    await ctx.error('Commande réservée aux administrateurs.');
    return;
  }

  incrementMessageCount();
  incrementCommandCount(command.name);
  logger.info(`Commande exécutée: ${parsed.command} par ${sender}`);
  await command.execute(ctx);
}

