import { startBaileysClient } from './core/client.js';
import { loadCommands } from './core/pluginLoader.js';
import { createMessageHandler } from './handlers/messageHandler.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { initViewOnceCache } from './core/viewOnceCache.js';
import { initLockScheduler } from './core/lockScheduler.js';
import { createGroupParticipantsHandler } from './handlers/groupParticipantsHandler.js';
import { startTelemetry } from './core/telemetry.js';

async function main() {
  logger.info(`Démarrage de ${config.botName}...`);

  const commands = await loadCommands();

  await startBaileysClient((sock) => {
    initViewOnceCache(sock);
    initLockScheduler(sock);
    sock.ev.on('messages.upsert', createMessageHandler(sock, commands));
    sock.ev.on('group-participants.update', createGroupParticipantsHandler(sock));
    startTelemetry();
    logger.info(`${config.botName} est prêt et écoute les messages.`);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Erreur fatale au démarrage');
  process.exit(1);
});