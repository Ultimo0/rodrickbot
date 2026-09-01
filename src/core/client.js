import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { handlePairingCode } from './pairing.js';

// WhatsApp traite les reconnexions rapides et répétées comme un
// comportement de spam/automatisation et peut restreindre le compte
// (c'est ce qui s'est produit). On reste donc volontairement lent et
// prudent plutôt que de retenter agressivement.
const MAX_RECONNECT_DELAY_MS = 5 * 60_000; // plafond: jamais plus de 5 min entre 2 tentatives
const BASE_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_ATTEMPTS = 8; // au-delà, on arrête complètement au lieu de boucler à l'infini

let readyCalled = false;
let reconnectAttempts = 0;
let stopped = false;

export async function startBaileysClient(onReady) {
  stopped = false;

  const { state, saveCreds } = await useMultiFileAuthState(config.authFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: logger.child({ module: 'baileys' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '120.0.0'],
  });

  await handlePairingCode(sock, state.creds.registered);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    handleConnectionUpdate(update, sock, onReady);
  });

  return sock;
}

/** Arrête toute reconnexion programmée. Utilisé pour les cas où retenter ne sert à rien. */
function haltReconnection(reason) {
  stopped = true;
  logger.error(
    `${reason} Le bot ne retentera plus automatiquement (pour éviter une nouvelle restriction du compte). ` +
      'Supprimez le dossier auth_info et relancez le bot pour re-générer une session propre.'
  );
}

function scheduleReconnect(onReady, immediate = false) {
  if (stopped) return;

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    haltReconnection(`Trop de tentatives de reconnexion échouées (${MAX_RECONNECT_ATTEMPTS}).`);
    return;
  }

  readyCalled = false;

  // Un peu d'aléatoire (jitter) pour éviter un motif de reconnexion trop
  // régulier/mécanique, qui est justement ce que les systèmes anti-spam
  // de WhatsApp repèrent.
  const jitter = Math.random() * 0.3 + 0.85; // entre 0.85x et 1.15x
  const delay = immediate
    ? 0
    : Math.min(
        MAX_RECONNECT_DELAY_MS,
        Math.round(BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts * jitter)
      );

  reconnectAttempts += 1;

  if (delay > 0) {
    logger.warn(
      `Reconnexion dans ${Math.round(delay / 1000)}s (tentative ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`
    );
  }

  setTimeout(() => {
    if (stopped) return;
    startBaileysClient(onReady).catch((err) => {
      logger.error({ err }, 'Échec de la reconnexion.');
      scheduleReconnect(onReady);
    });
  }, delay);
}

function handleConnectionUpdate(update, sock, onReady) {
  const { connection, lastDisconnect, qr } = update;

  if (qr && config.authMethod === 'qr') {
    logger.info('Scannez ce QR code avec WhatsApp:');
    qrcode.generate(qr, { small: true });
  }

  if (connection === 'open') {
    logger.info('Connexion établie avec succès.');
    reconnectAttempts = 0;
    stopped = false;
    if (!readyCalled) {
      readyCalled = true;
      // onReady() n'est pas awaited ici par nature (ce callback n'est pas
      // async) — s'il rejette (ex: sendStartupMessage échoue faute de
      // réseau) sans ce .catch(), c'était une promesse rejetée jamais
      // gérée : plantage de tout le process (voir boot.mjs pour le filet
      // de sécurité global, mais autant intercepter ici avec un message
      // d'erreur qui a du contexte plutôt que le générique).
      try {
        Promise.resolve(onReady(sock)).catch((err) => {
          logger.error({ err }, "Erreur dans onReady() après connexion (le bot continue)");
        });
      } catch (err) {
        logger.error({ err }, "Erreur synchrone dans onReady() après connexion (le bot continue)");
      }
    }
  }

  if (connection === 'close') {
    const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;

    // Codes pour lesquels retenter ne réglera rien — au contraire, boucler
    // dessus est exactement ce qui a fait passer le compte pour du spam.
    const loggedOut = statusCode === DisconnectReason.loggedOut;
    const badSession = statusCode === DisconnectReason.badSession;
    const connectionReplaced = statusCode === DisconnectReason.connectionReplaced;
    const multideviceMismatch = statusCode === DisconnectReason.multideviceMismatch;

    if (loggedOut || badSession || multideviceMismatch) {
      haltReconnection(`Session invalide ou expirée (code ${statusCode}).`);
      return;
    }

    if (connectionReplaced) {
      haltReconnection('Un autre appareil s\'est connecté avec la même session (connectionReplaced).');
      return;
    }

    const restartRequired = statusCode === DisconnectReason.restartRequired;

    logger.warn(`Connexion perdue (code ${statusCode ?? 'inconnu'}).`);
    scheduleReconnect(onReady, restartRequired);
  }
}