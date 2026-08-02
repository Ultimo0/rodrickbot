import { readFileSync } from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { isLockdownMode, getMessageCount, getCommandStats } from './state.js';
import { setRemotelyDisabled, isRemotelyDisabled } from './remoteControl.js';

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalHandle = null;

async function sendHeartbeat() {
  const { telemetryUrl, telemetryApiKey, instanceId, instanceOwner } = config;

  try {
    const res = await fetch(`${telemetryUrl.replace(/\/$/, '')}/api/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': telemetryApiKey,
      },
      body: JSON.stringify({
        instanceId,
        ownerName: instanceOwner,
        botName: config.botName,
        version: pkg.version,
        uptimeSeconds: Math.round(process.uptime()),
        messageCount: getMessageCount(),
        commandStats: getCommandStats(),
        mode: isLockdownMode() ? 'Privé' : 'Public',
        prefix: config.prefix,
        nodeVersion: process.version,
      }),
    });

    if (!res.ok) {
      logger.warn(`Télémétrie: le dashboard a répondu ${res.status}`);
      return;
    }

    const data = await res.json().catch(() => null);
    if (data && typeof data.enabled === 'boolean') {
      const shouldBeDisabled = !data.enabled;
      if (shouldBeDisabled !== isRemotelyDisabled()) {
        setRemotelyDisabled(shouldBeDisabled);
        logger.warn(
          shouldBeDisabled
            ? 'Cette copie a été désactivée à distance depuis le dashboard — elle ne répond plus aux commandes.'
            : 'Cette copie a été réactivée à distance depuis le dashboard.'
        );
      }
    }
  } catch (err) {
    // On ne veut jamais faire planter le bot pour un problème réseau côté
    // dashboard — on log juste un avertissement et on réessaiera au
    // prochain intervalle.
    logger.warn({ err }, 'Télémétrie: envoi du heartbeat impossible');
  }
}

/**
 * Démarre l'envoi périodique d'un "heartbeat" vers le dashboard centralisé
 * (voir dashboard-server/). Ne fait rien si TELEMETRY_URL n'est pas
 * configuré — fonctionnalité entièrement optionnelle et sans effet sur le
 * reste du bot si elle n'est pas activée.
 */
export function startTelemetry() {
  if (!config.telemetryUrl) {
    logger.debug('Télémétrie désactivée (TELEMETRY_URL non défini).');
    return;
  }

  if (!config.telemetryApiKey || !config.instanceId) {
    logger.warn(
      'TELEMETRY_URL est défini mais TELEMETRY_API_KEY ou INSTANCE_ID est manquant — télémétrie désactivée.'
    );
    return;
  }

  if (intervalHandle) return; // déjà démarrée (ex: reconnexion)

  sendHeartbeat();
  intervalHandle = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  logger.info(`Télémétrie activée (instance: ${config.instanceId}, propriétaire: ${config.instanceOwner}).`);
}