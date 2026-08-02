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

const MAX_RECONNECT_DELAY_MS = 30_000; // plafond: jamais plus de 30s entre 2 tentatives
const BASE_RECONNECT_DELAY_MS = 1_000;

let readyCalled = false;
let reconnectAttempts = 0;

/**
 * Crée le socket Baileys et gère tout son cycle de vie:
 * authentification (QR ou pairing code), reconnexion automatique
 * avec backoff exponentiel, et sauvegarde des credentials.
 *
 * @param {(sock) => void} onReady - appelé une seule fois par connexion réussie
 * @returns {Promise<import('@whiskeysockets/baileys').WASocket>}
 */
export async function startBaileysClient(onReady) {
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

function scheduleReconnect(onReady, immediate = false) {
  readyCalled = false;

  const delay = immediate
    ? 0
    : Math.min(
        MAX_RECONNECT_DELAY_MS,
        BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts
      );

  reconnectAttempts += 1;

  if (delay > 0) {
    logger.warn(`Reconnexion dans ${Math.round(delay / 1000)}s (tentative ${reconnectAttempts})...`);
  }

  setTimeout(() => {
    startBaileysClient(onReady).catch((err) => {
      logger.error({ err }, 'Échec de la reconnexion, nouvelle tentative programmée');
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
    reconnectAttempts = 0; // on repart de zéro après un succès
    if (!readyCalled) {
      readyCalled = true;
      onReady(sock);
    }
  }

  if (connection === 'close') {
    const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
    const loggedOut = statusCode === DisconnectReason.loggedOut;
    // Se produit typiquement juste après un pairing réussi: reconnexion
    // immédiate nécessaire, ce n'est pas une vraie coupure.
    const restartRequired = statusCode === DisconnectReason.restartRequired;

    if (loggedOut) {
      logger.error('Session déconnectée (logout). Supprimez le dossier auth_info et rescannez.');
      return;
    }

    logger.warn(`Connexion perdue (code ${statusCode ?? 'inconnu'}).`);
    scheduleReconnect(onReady, restartRequired);
  }
}