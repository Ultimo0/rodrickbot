/**
 * Bridge de sécurité entre l’Agent IA et les commandes historiques.
 *
 * Ce module ne réécrit pas la logique des commandes. Il recrée simplement
 * un `ctx` de commande compatible avec le moteur existant, puis appelle
 * la méthode `execute(ctx)` de la commande chargée par le plugin loader.
 *
 * Cela permet à l’Agent d’appeler des commandes déjà validées par le bot
 * sans casser le système de permissions ni le pipeline d’exécution.
 */

import { config, isAdmin } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { isLockdownMode, incrementMessageCount, incrementCommandCount } from '../core/state.js';
import { isRemotelyDisabled } from '../core/remoteControl.js';
import { isInstanceConfigured } from '../core/instance.js';
import { attachReplyHelpers } from '../utils/reply.js';
import { isGroup, toQuoteBlock } from '../utils/helpers.js';
import { runMiddlewares } from '../middlewares/index.js';
import { handleAntilink } from '../utils/antilink.js';
import { handleDownloadReply } from '../utils/downloadReply.js';

/**
 * Exécute une commande existante à partir d’un nom, en réutilisant son
 * `ctx` et les garde-fous déjà présents dans le handler de messages.
 */
export async function invokeExistingCommand(commandName, { sock, msg, chatId, sender, args = [], commands }) {
  const command = commands.get(commandName);
  if (!command) {
    throw new Error(`Commande inconnue: ${commandName}`);
  }

  if (isRemotelyDisabled()) {
    return false;
  }

  if (!msg?.message) {
    return false;
  }

  // Voir le même commentaire dans handlers/messageHandler.js : fromMe doit
  // être traité aussi bien en privé qu'en groupe, pas seulement en privé.
  const isSelfTest = msg.key.fromMe && config.allowSelfTest;
  if (msg.key.fromMe && !isSelfTest) {
    return false;
  }

  if (await handleAntilink(sock, msg, chatId, sender, msg.message?.conversation || '')) {
    return false;
  }

  if (await handleDownloadReply(sock, chatId, sender, msg.message?.conversation || '', msg)) {
    return false;
  }

  const ctx = {
    sock,
    msg,
    chatId,
    sender,
    args,
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
        'Exécute d\'abord :\n' +
        '!setup <identifiant> <propriétaire>\n\n' +
        'Exemple : !setup boutique-jean Jean Dupont'
    );
    return false;
  }

  if (isLockdownMode() && !ctx.isAdmin) {
    logger.debug(`Commande ignorée (mode privé strict actif): ${sender}`);
    return false;
  }

  if (!runMiddlewares(ctx)) {
    logger.debug(`Message bloqué par un middleware: ${sender}`);
    return false;
  }

  const isPrivateOnly = command.privateOnly !== false;
  if (isPrivateOnly && ctx.isGroup) {
    await ctx.error('Cette commande fonctionne uniquement en message privé.');
    return false;
  }

  if (command.adminOnly && !ctx.isAdmin) {
    await ctx.error('Commande réservée aux administrateurs.');
    return false;
  }

  incrementMessageCount();
  incrementCommandCount(command.name);
  logger.info(`Commande exécutée via bridge Agent: ${commandName} par ${sender}`);
  await command.execute(ctx);
  return true;
}
