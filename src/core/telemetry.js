import { readFileSync } from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { isLockdownMode, getMessageCount, getCommandStats } from './state.js';
import { setRemotelyDisabled, isRemotelyDisabled } from './remoteControl.js';
import { getInstance } from './instance.js';

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalHandle = null;

async function sendHeartbeat() {
  const { telemetryUrl, telemetryApiKey } = config;
  const { instanceId, instanceOwner } = getInstance();

  // Timeout indispensable ici : ce heartbeat tourne dans un setInterval qui
  // relance l'appel toutes les 5 minutes SANS attendre que le précédent
  // soit terminé. Sans timeout, un dashboard qui ne répond jamais (arrêté,
  // réseau coupé...) ferait s'empiler un fetch() bloqué de plus toutes les
  // 5 minutes, indéfiniment — une fuite lente de connexions ouvertes, du
  // genre qui ne se voit qu'après plusieurs jours d'uptime.
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 10_000);

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
      signal: controller.signal,
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
    logger.warn({ err }, 'Télémétrie: envoi du heartbeat impossible');
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export function startTelemetry() {
  if (!config.telemetryUrl) {
    logger.debug('Télémétrie désactivée (TELEMETRY_URL non défini).');
    return;
  }

  const { instanceId, instanceOwner } = getInstance();

  if (!config.telemetryApiKey || !instanceId) {
    logger.warn(
      'TELEMETRY_URL est défini mais TELEMETRY_API_KEY ou instanceId (voir !setup) est manquant — télémétrie désactivée.'
    );
    return;
  }

  if (intervalHandle) return; // déjà démarrée (ex: reconnexion)

  sendHeartbeat();
  intervalHandle = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  logger.info(`Télémétrie activée (instance: ${instanceId}, propriétaire: ${instanceOwner}).`);
}

// Redaction avant envoi : un message/stack d'erreur peut accidentellement
// contenir un JID ou un numéro (beaucoup de logger.warn/error du projet
// interpolent `sender` dans leur message). "Anonymisé" doit être vrai, pas
// juste un mot dans un commentaire — donc on retire activement ces motifs
// avant que quoi que ce soit ne parte vers le dashboard.
const JID_REGEX = /\d{5,}(:\d+)?@(s\.whatsapp\.net|g\.us|lid|newsletter)/g;
const PHONE_LIKE_REGEX = /\b\d{7,15}\b/g;

function sanitize(text) {
  if (!text) return '';
  return String(text).replace(JID_REGEX, '[jid]').replace(PHONE_LIKE_REGEX, '[nombre]');
}

/**
 * Remonte une erreur inattendue au dashboard, de façon anonymisée et
 * strictement best-effort (jamais de log en boucle, jamais bloquant).
 * Branché sur les gestionnaires globaux uncaughtException/unhandledRejection
 * (voir index.js) — pas sur chaque try/catch du projet, où le risque de
 * message contenant un JID interpolé est plus élevé et moins prévisible.
 * N'envoie rien si la télémétrie n'est pas déjà configurée (même
 * interrupteur que le heartbeat — pas de variable séparée à gérer).
 */
export async function reportError(err) {
  if (!config.telemetryUrl || !config.telemetryApiKey) return;

  const { instanceId } = getInstance();
  if (!instanceId) return;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 10_000);

  try {
    await fetch(`${config.telemetryUrl.replace(/\/$/, '')}/api/error-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.telemetryApiKey,
      },
      body: JSON.stringify({
        instanceId,
        botName: config.botName,
        version: pkg.version,
        nodeVersion: process.version,
        errorMessage: sanitize(err?.message || String(err)),
        // 5 premières lignes seulement : largement suffisant pour situer
        // l'origine du bug, pas besoin de la stack complète.
        errorStack: sanitize(err?.stack || '').split('\n').slice(0, 5).join('\n'),
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
  } catch {
    // Best-effort volontaire : si le dashboard est injoignable, on ne veut
    // surtout pas qu'un souci de réseau ici génère lui-même du bruit dans
    // les logs à chaque erreur applicative — l'erreur d'origine est déjà
    // journalisée par l'appelant (voir index.js).
  } finally {
    clearTimeout(timeoutHandle);
  }
}