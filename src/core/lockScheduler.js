import { setSchedule, clearSchedule, getAllSchedules } from './lockSchedules.js';
import { logger } from '../utils/logger.js';

async function runAction(sock, chatId, action) {
  try {
    await sock.groupSettingUpdate(chatId, action === 'lock' ? 'announcement' : 'not_announcement');
    await sock.sendMessage(chatId, {
      text:
        action === 'lock'
          ? '🔒 Groupe reverrouillé automatiquement : seuls les admins peuvent écrire.'
          : '🔓 Groupe déverrouillé automatiquement : tout le monde peut écrire.',
    });
  } catch (err) {
    logger.warn({ err, chatId }, "Impossible d'exécuter l'action programmée (lock/unlock)");
  } finally {
    try {
      clearSchedule(chatId);
    } catch (err) {
      // Une erreur ici remplacerait l'erreur d'origine si elle remontait.
      logger.error({ err, chatId }, "Impossible de retirer l'action programmée du disque");
    }
  }
}

export function scheduleAutoAction(sock, chatId, action, ms) {
  const at = Date.now() + ms;
  setSchedule(chatId, action, at);
  setTimeout(() => runAction(sock, chatId, action), ms);
}

export function initLockScheduler(sock) {
  const schedules = getAllSchedules();

  for (const [chatId, { action, at }] of Object.entries(schedules)) {
    const remaining = at - Date.now();

    if (remaining <= 0) {
      runAction(sock, chatId, action);
    } else {
      setTimeout(() => runAction(sock, chatId, action), remaining);
    }
  }
}