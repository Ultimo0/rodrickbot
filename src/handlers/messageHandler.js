import { config, isAdmin } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { extractText, isGroup, parseCommand, toQuoteBlock } from '../utils/helpers.js';
import { runMiddlewares } from '../middlewares/index.js';
import { attachReplyHelpers } from '../utils/reply.js';
import { isLockdownMode, incrementMessageCount } from '../core/state.js';
import { handleAntilink } from '../utils/antilink.js';
import { handleDownloadReply } from '../utils/downloadReply.js';

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

  const isSelfTest = msg.key.fromMe && config.allowSelfTest && !isGroup(msg.key.remoteJid);
  if (msg.key.fromMe && !isSelfTest) return;

  const chatId = msg.key.remoteJid;
  const sender = isGroup(chatId) ? msg.key.participant : chatId;
  const text = extractText(msg);

  if (await handleAntilink(sock, msg, chatId, sender, text)) return;
  if (await handleDownloadReply(sock, chatId, sender, text, msg)) return;

  const parsed = parseCommand(text, config.prefix);
  if (!parsed) return;

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
  logger.info(`Commande exécutée: ${parsed.command} par ${sender}`);
  await command.execute(ctx);
}