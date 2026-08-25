import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { toScriptFont } from '../utils/fancyFont.js';
import { sendChannelText } from '../utils/channelCard.js';
import { getLastSummonId, setLastSummonId } from './state.js';

// Poll dédié, séparé de la télémétrie (5 min) : ici on veut une réaction
// quasi instantanée quand on appuie sur le bouton du dashboard, donc un
// intervalle court sur un endpoint volontairement très léger (GET /api/summon).
const SUMMON_POLL_INTERVAL_MS = 10 * 1000;

// Délai entre deux envois de groupe en groupe. Comme pour les reconnexions
// (voir core/client.js), on reste volontairement lent : envoyer d'un coup
// dans des dizaines de groupes ressemble à du spam automatisé pour WhatsApp
// et peut faire restreindre le compte.
const MIN_DELAY_BETWEEN_GROUPS_MS = 1500;
const MAX_DELAY_BETWEEN_GROUPS_MS = 3500;

let intervalHandle = null;
let running = false; // évite deux invocations en parallèle si le poll tombe pendant un envoi encore en cours

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay() {
  return MIN_DELAY_BETWEEN_GROUPS_MS
    + Math.random() * (MAX_DELAY_BETWEEN_GROUPS_MS - MIN_DELAY_BETWEEN_GROUPS_MS);
}

async function broadcastToAllGroups(sock, text) {
  let groups;
  try {
    groups = await sock.groupFetchAllParticipating();
  } catch (err) {
    logger.error({ err }, 'Invocation: impossible de récupérer la liste des groupes.');
    return;
  }

  const chatIds = Object.keys(groups);
  logger.info(`Invocation reçue — envoi dans ${chatIds.length} groupe(s).`);

  for (const chatId of chatIds) {
    try {
      await sendChannelText(sock, chatId, text);
    } catch (err) {
      logger.warn({ err, chatId }, 'Invocation: échec de l\'envoi dans ce groupe, on continue avec les suivants.');
    }
    await sleep(randomDelay());
  }

  logger.info('Invocation: diffusion terminée.');
}

async function pollSummon(sock) {
  if (running) return;

  const { telemetryUrl, telemetryApiKey } = config;

  try {
    const res = await fetch(`${telemetryUrl.replace(/\/$/, '')}/api/summon`, {
      headers: { 'x-api-key': telemetryApiKey },
    });

    if (!res.ok) return; // pas de log ici pour ne pas spammer le logger toutes les 10s en cas de souci réseau ponctuel

    const data = await res.json().catch(() => null);
    const summon = data?.summon;
    if (!summon?.id) return;

    if (summon.id === getLastSummonId()) return; // déjà traitée

    // On marque comme traitée AVANT l'envoi (et non après) : si l'envoi
    // plante en cours de route, on ne veut pas re-spammer tous les groupes
    // au prochain poll 10s plus tard — une invocation ratée reste ratée,
    // il suffira de rappuyer sur le bouton du dashboard.
    setLastSummonId(summon.id);

    running = true;
    const text = toScriptFont(summon.message || "Je m'incline devant votre sagesse, Seigneur.");
    await broadcastToAllGroups(sock, text);
  } catch (err) {
    logger.debug({ err }, 'Invocation: poll impossible (réseau).');
  } finally {
    running = false;
  }
}

export function initSummonListener(sock) {
  if (!config.telemetryUrl || !config.telemetryApiKey) {
    logger.debug('Écoute des invocations désactivée (télémétrie non configurée).');
    return;
  }

  if (intervalHandle) return; // déjà démarrée (ex: reconnexion)

  intervalHandle = setInterval(() => pollSummon(sock), SUMMON_POLL_INTERVAL_MS);
  intervalHandle.unref?.();
  logger.info('Écoute des invocations du dashboard activée.');
}
