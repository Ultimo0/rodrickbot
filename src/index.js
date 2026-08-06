import { startBaileysClient } from './core/client.js';
import { loadCommands } from './core/pluginLoader.js';
import { createMessageHandler } from './handlers/messageHandler.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { initViewOnceCache } from './core/viewOnceCache.js';
import { initLockScheduler } from './core/lockScheduler.js';
import { createGroupParticipantsHandler } from './handlers/groupParticipantsHandler.js';
import { startTelemetry } from './core/telemetry.js';
import { sendStartupMessage } from './utils/startupMessage.js';

// Sans ces relais, une promesse rejetée hors de tout try/catch (callback
// Baileys, setTimeout...) disparaît silencieusement ou tue le process sans
// laisser de trace exploitable dans les logs.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promesse rejetée sans gestionnaire');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Exception non capturée — arrêt du bot');
  process.exit(1);
});

async function main() {
  logger.info(`Démarrage de ${config.botName}...`);

  const commands = await loadCommands();
  const commandCount = new Set(commands.values()).size; // dédoublonne les alias

  await startBaileysClient((sock) => {
    initViewOnceCache(sock);
    initLockScheduler(sock);
    sock.ev.on('messages.upsert', createMessageHandler(sock, commands));
    sock.ev.on('group-participants.update', createGroupParticipantsHandler(sock));
    startTelemetry();
    logger.info(`${config.botName} est prêt et écoute les messages.`);
    sendStartupMessage(sock, commandCount).catch((err) => {
      logger.warn({ err }, 'Envoi du message de démarrage impossible');
    });
  });
}

main().catch((err) => {
  logger.error({ err }, 'Erreur fatale au démarrage');
  process.exit(1);
});