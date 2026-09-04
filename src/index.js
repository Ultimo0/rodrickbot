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
import { initDeletedMessageCache } from './core/deletedMessageCache.js';
import { createGroupParticipantsHandler } from './handlers/groupParticipantsHandler.js';
import { startTelemetry } from './core/telemetry.js';
import { sendStartupMessage } from './utils/startupMessage.js';
import { initQuizCleanupService } from './core/quiz/QuizCleanupService.js';
import { cleanupStaleSessionsOnBoot as cleanupStaleCalcSessions } from './core/calc/CalcEngine.js';
import { initPollCleanupService } from './core/poll/PollCleanupService.js';
import { initRemindScheduler } from './core/remind/RemindScheduler.js';
import { initMessageScheduler } from './core/messageScheduler.js';
import { initYtDlpAutoUpdater } from './core/ytdlpAutoUpdater.js';

async function main() {
  logger.info(`Démarrage de ${config.botName}...`);
  // Filet de sécurité global : une exception ou un rejet de promesse non
  // rattrapé ailleurs (ex: dans les internals de Baileys eux-mêmes,
  // hors du try/catch par message de createMessageHandler) ferait
  // normalement planter tout le process Node. On journalise et on
  // continue plutôt que de laisser un seul incident inattendu couper la
  // connexion WhatsApp entière. Non spécifique à un bug connu — sert de
  // dernier rempart générique, quelle que soit la cause.
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Exception non rattrapée (le bot continue)');
  });
  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Promesse rejetée non rattrapée (le bot continue)');
  });

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
    initDeletedMessageCache(sock);
    initQuizCleanupService(sock); // reprend les sessions quiz actives + démarre le balayage périodique
    cleanupStaleCalcSessions(); // clôture toute partie de calcul mental restée active avant ce redémarrage
    initPollCleanupService(sock); // reprend les sondages actifs (expiration) + démarre le balayage périodique
    initRemindScheduler(sock); // balayage périodique des rappels arrivés à échéance (voir RemindScheduler.js — pas de setTimeout par rappel, volontairement)
    initMessageScheduler(sock); // recharge et replanifie les messages récurrents (!schedule)
    initYtDlpAutoUpdater(); // rafraîchit le binaire yt-dlp toutes les 24h, sans redémarrage nécessaire

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