import { startBaileysClient } from './core/client.js';
import { loadCommands } from './core/pluginLoader.js';
import { loadThemes } from './themes/engine.js';
import { createMessageHandler } from './handlers/messageHandler.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { initViewOnceCache } from './core/viewOnceCache.js';
import { initLockScheduler } from './core/lockScheduler.js';
import { initGroupGuardian } from './core/groupGuardian.js';
import { initAntispamGuard } from './core/antispamGuard.js';
import { createGroupParticipantsHandler } from './handlers/groupParticipantsHandler.js';
import { startTelemetry } from './core/telemetry.js';
import { sendStartupMessage } from './utils/startupMessage.js';

async function main() {
  logger.info(`Démarrage de ${config.botName}...`);

  const commands = await loadCommands();
  await loadThemes();
  // Même filtre que getVisibleCommands() dans commands/help.js : !help ne se
  // liste pas lui-même dans le menu, donc on l'exclut aussi ici pour que ce
  // chiffre corresponde à celui affiché par !menu (sinon 43 vs 42 au démarrage).
  const commandCount = [...new Set(commands.values())].filter((cmd) => cmd.name !== 'help').length;

  await startBaileysClient((sock) => {
    initViewOnceCache(sock);
    initLockScheduler(sock);
    initGroupGuardian(sock);
    initAntispamGuard(sock);
    sock.ev.on('messages.upsert', createMessageHandler(sock, commands));
    sock.ev.on('group-participants.update', createGroupParticipantsHandler(sock));
    startTelemetry();
    logger.info(`${config.botName} est prêt et écoute les messages.`);
    sendStartupMessage(sock, commandCount);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Erreur fatale au démarrage');
  process.exit(1);
});