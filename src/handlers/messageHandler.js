import { config, isAdmin } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { extractText, isGroup, parseCommand, toQuoteBlock } from '../utils/helpers.js';
import { runMiddlewares } from '../middlewares/index.js';
import { attachReplyHelpers } from '../utils/reply.js';
import { isLockdownMode, incrementMessageCount, incrementCommandCount } from '../core/state.js';
import { isRemotelyDisabled } from '../core/remoteControl.js';
import { handleAntilink } from '../utils/antilink.js';
import { handleDownloadReply } from '../utils/downloadReply.js';
import { isInstanceConfigured } from '../core/instance.js';
import { runAgentTurn } from '../agent/index.js';

export function createMessageHandler(sock, commands) {
  return async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        await handleSingleMessage(sock, commands, msg);
      } catch (err) {
        logger.error({ err }, 'Erreur lors du traitement d\'un message');
      }
    }
  };
}

async function handleSingleMessage(sock, commands, msg) {
  if (!msg.message) return;

  // Interrupteur à distance
  if (isRemotelyDisabled()) return;

  const isSelfTest = msg.key.fromMe && config.allowSelfTest && !isGroup(msg.key.remoteJid);
  if (msg.key.fromMe && !isSelfTest) return;

  const chatId = msg.key.remoteJid;
  const sender = isGroup(chatId) ? msg.key.participant : chatId;
  
  // LOG TEMPORAIRE POUR DIAGNOSTIQUER LES MESSAGES CITÉS
  if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage ||
      msg.message.contextInfo?.quotedMessage) {
    console.log('=== MESSAGE AVEC CITATION DÉTECTÉ ===');
    console.log('Message complet:', JSON.stringify(msg, null, 2));
  }
  
  const text = extractText(msg);

  if (await handleAntilink(sock, msg, chatId, sender, text)) return;
  if (await handleDownloadReply(sock, chatId, sender, text, msg)) return;

  const parsed = parseCommand(text, config.prefix);
  if (!parsed) {
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

