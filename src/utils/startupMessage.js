import { config, getApiKeyStatuses } from '../config/index.js';
import { isInstanceConfigured, getInstance } from '../core/instance.js';
import { isLockdownMode } from '../core/state.js';
import { getCurrentTheme } from '../themes/engine.js';
import { logger } from './logger.js';

const OWNER_SIGNATURE = 'Rodrigue Njaka';

/** Construit le texte du message de démarrage envoyé en privé sur WhatsApp. */
export function buildStartupMessage(commandCount) {
  const theme = getCurrentTheme();
  const instance = isInstanceConfigured() ? getInstance() : null;

  return theme.renderStartup({
    botName: config.botName,
    signature: OWNER_SIGNATURE,
    configured: isInstanceConfigured(),
    instanceId: instance?.instanceId,
    instanceOwner: instance?.instanceOwner,
    prefix: config.prefix,
    commandCount,
    mode: isLockdownMode() ? 'Privé' : 'Public',
    apiKeys: getApiKeyStatuses(),
  });
}

/**
 * Envoie le message de démarrage en privé, dans la conversation "Vous"
 * (message à soi-même sur le numéro du bot). Ne fait rien si PHONE_NUMBER
 * n'est pas défini dans .env.
 */
export async function sendStartupMessage(sock, commandCount) {
  if (!config.phoneNumber) {
    logger.debug('PHONE_NUMBER non défini, message de démarrage non envoyé.');
    return;
  }

  const selfJid = `${config.phoneNumber}@s.whatsapp.net`;

  try {
    await sock.sendMessage(selfJid, { text: buildStartupMessage(commandCount) });
  } catch (err) {
    logger.warn({ err }, "Impossible d'envoyer le message de démarrage en privé");
  }
}