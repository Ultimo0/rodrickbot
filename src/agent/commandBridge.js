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
 * Commandes historiques que l’agent est autorisé à invoquer via
 * `invokeExistingCommand`. Volontairement définie ICI (et non côté
 * agentService.js, qui se contentait auparavant de pré-filtrer côté
 * appelant) : c’est ce module qui porte le pont vers le moteur de
 * commandes, donc c’est lui qui doit garantir qu’aucune autre commande
 * n’est atteignable par ce chemin, même si un futur appelant oublie de
 * pré-filtrer.
 */
export const BRIDGE_ALLOWED_COMMANDS = ['help', 'ping', 'status', 'statut', 'whoami', 'menu', 'agent', 'setup'];

/**
 * Exécute une commande existante à partir d’un nom, en réutilisant son
 * `ctx` et les garde-fous déjà présents dans le handler de messages.
 *
 * Valeur de retour : `true` dès que le bridge a pris en charge la
 * requête — succès, refus explicite (ex: "réservé au privé/aux admins")
 * avec message envoyé, ou silence intentionnel d'un garde-fou existant
 * (lockdown, bot désactivé à distance, antilink...). `false` UNIQUEMENT
 * quand le bridge n'a rien géré du tout (nom hors liste blanche) — dans
 * ce cas seulement, l'appelant (agentService.js) peut retomber sur un
 * autre traitement. Ne jamais renvoyer `false` après avoir déjà envoyé
 * un message ou pris une décision : l'appelant retomberait alors sur
 * `executeTool(commandName, ...)`, qui échoue systématiquement pour ces
 * noms (ping/status/... sont des commandes pontées, jamais des outils
 * agent enregistrés), causant un second message d'erreur parasite.
 */
export async function invokeExistingCommand(commandName, { sock, msg, chatId, sender, args = [], commands }) {
  if (!BRIDGE_ALLOWED_COMMANDS.includes(commandName)) {
    logger.warn(`Commande refusée par le bridge Agent (hors liste blanche) : ${commandName}`);
    return false;
  }

  const command = commands.get(commandName);
  if (!command) {
    throw new Error(`Commande inconnue: ${commandName}`);
  }

  if (isRemotelyDisabled()) {
    // Le bot est désactivé à distance : silence intentionnel, mais c'est
    // bien "géré" par le bridge — pas la peine de retomber sur
    // executeTool(), qui échouerait avec "Outil inconnu" pour un nom de
    // commande pontée (ping/status/...) qui n'est jamais un outil agent.
    return true;
  }

  if (!msg?.message) {
    return true;
  }

  // Voir le même commentaire dans handlers/messageHandler.js : fromMe doit
  // être traité aussi bien en privé qu'en groupe, pas seulement en privé.
  const isSelfTest = msg.key.fromMe && config.allowSelfTest;
  if (msg.key.fromMe && !isSelfTest) {
    return true;
  }

  if (await handleAntilink(sock, msg, chatId, sender, msg.message?.conversation || '')) {
    return true;
  }

  if (await handleDownloadReply(sock, chatId, sender, msg.message?.conversation || '', msg)) {
    return true;
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
    return true;
  }

  if (isLockdownMode() && !ctx.isAdmin) {
    logger.debug(`Commande ignorée (mode privé strict actif): ${sender}`);
    return true;
  }

  if (!runMiddlewares(ctx)) {
    logger.debug(`Message bloqué par un middleware: ${sender}`);
    return true;
  }

  const isPrivateOnly = command.privateOnly !== false;
  if (isPrivateOnly && ctx.isGroup) {
    await ctx.error('Cette commande fonctionne uniquement en message privé.');
    return true;
  }

  if (command.adminOnly && !ctx.isAdmin) {
    await ctx.error('Commande réservée aux administrateurs.');
    return true;
  }

  incrementMessageCount();
  incrementCommandCount(command.name);
  logger.info(`Commande exécutée via bridge Agent: ${commandName} par ${sender}`);
  await command.execute(ctx);
  return true;
}
