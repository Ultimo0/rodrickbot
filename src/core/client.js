import {
  makeWASocket,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { handlePairingCode } from './pairing.js';
import { backupSessionIfValid, restoreSessionIfCorrupted } from './sessionBackup.js';
import { wrapSocketWithOutboundGateway } from './outboundGateway.js';
import { setOwnerJid } from './adminStore.js';
import { markConnectedNow } from './state.js';
import { getSentContent } from './sentMessageStore.js';

// WhatsApp traite les reconnexions rapides et répétées comme un
// comportement de spam/automatisation et peut restreindre le compte
// (c'est ce qui s'est produit). On reste donc volontairement lent et
// prudent plutôt que de retenter agressivement.
const MAX_RECONNECT_DELAY_MS = 5 * 60_000; // plafond: jamais plus de 5 min entre 2 tentatives
const BASE_RECONNECT_DELAY_MS = 2_000;
// Pas de plafond sur le nombre de tentatives : le bot doit continuer à
// retenter automatiquement (avec un backoff croissant plafonné à
// MAX_RECONNECT_DELAY_MS) tant que WhatsApp n'a pas explicitement signalé
// que la session est morte (loggedOut). Un code 500/badSession ponctuel ne
// suffit pas à considérer la session comme perdue : ça peut être une simple
// erreur de stream transitoire.
const RECONNECT_BACKOFF_CAP_ATTEMPTS = 8; // au-delà, le délai reste plafonné mais on continue de retenter

// Tuning pour connexions instables/lentes (le cas d'usage visé ici) :
// valeurs plus généreuses que les défauts de Baileys (20s / 30s / 60s)
// pour ne pas faire échouer une négociation ou une requête juste parce
// qu'un aller-retour a pris plus longtemps que d'habitude.
const CONNECT_TIMEOUT_MS = 60_000; // temps max pour établir la connexion WebSocket (défaut Baileys: 20s)
const KEEP_ALIVE_INTERVAL_MS = 25_000; // ping-pong un peu plus fréquent que le défaut (30s) pour détecter une coupure plus vite
const QUERY_TIMEOUT_MS = 90_000; // délai avant qu'une requête (envoi, etc.) soit considérée en échec (défaut: 60s)
const RETRY_REQUEST_DELAY_MS = 5_000; // délai entre deux tentatives internes Baileys pour une même requête
const MAX_MSG_RETRY_COUNT = 5; // tentatives internes Baileys pour renvoyer un message non accusé de réception

// Si la récupération de la dernière version Baileys (requête réseau) ne
// répond pas dans ce délai, on démarre quand même avec la version
// embarquée par défaut de la librairie plutôt que de bloquer indéfiniment
// le démarrage/la reconnexion sur une mauvaise connexion.
const VERSION_FETCH_TIMEOUT_MS = 10_000;

// Re-sauvegarde périodique du dossier de session pendant qu'une connexion
// reste ouverte : les clés Signal tournent avec le temps (creds.update),
// donc un snapshot pris uniquement à la connexion peut devenir périmé sur
// une session qui reste connectée plusieurs jours d'affilée.
const PERIODIC_BACKUP_INTERVAL_MS = 3 * 60 * 60_000; // toutes les 3h
let periodicBackupHandle = null;

let readyCalled = false;
let reconnectAttempts = 0;
let stopped = false;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout après ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// La résolution de version fait un appel réseau : sur une mauvaise
// connexion elle peut traîner ou échouer. On la borne dans le temps et on
// se rabat sur la version embarquée par défaut de Baileys (en ne passant
// pas `version` à makeWASocket) plutôt que de bloquer tout le démarrage
// pour ça.
async function resolveBaileysVersion() {
  try {
    const { version, isLatest } = await withTimeout(fetchLatestBaileysVersion(), VERSION_FETCH_TIMEOUT_MS);
    if (!isLatest) {
      logger.info('Une version plus récente de WhatsApp Web existe ; on continue avec la version résolue.');
    }
    return version;
  } catch (err) {
    logger.warn(
      { err },
      "Impossible de récupérer la dernière version Baileys (réseau lent/indisponible) — démarrage avec la version embarquée par défaut."
    );
    return undefined;
  }
}

export async function startBaileysClient(onReady) {
  try {
    return await connectOnce(onReady);
  } catch (err) {
    // Une erreur ICI (avant même l'ouverture du socket : lecture de session,
    // résolution de version, échec du pairing...) ne doit jamais faire
    // planter tout le process — sur une mauvaise connexion c'est justement
    // le cas le plus probable, y compris au tout premier démarrage. On
    // retente avec le même backoff que pour une déconnexion en cours de
    // route, plutôt que de laisser l'erreur remonter jusqu'à main() dans
    // index.js (qui, avant ce correctif, faisait crasher tout le process
    // avec process.exit(1) si le tout premier essai échouait).
    logger.error({ err }, 'Échec de connexion (probablement réseau) — nouvelle tentative automatique.');
    scheduleReconnect(onReady);
    return null;
  }
}

async function connectOnce(onReady) {
  stopped = false;

  const restored = restoreSessionIfCorrupted();
  if (restored) {
    logger.info('Session restaurée automatiquement depuis une sauvegarde, tentative de connexion...');
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.authFolder);
  const version = await resolveBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      // Recommandé par le guide de migration Baileys 7.0.0 : améliore la
      // fiabilité/performance des sessions Signal en mettant en cache les
      // clés en mémoire plutôt que de relire le disque à chaque opération.
      keys: makeCacheableSignalKeyStore(state.keys, logger.child({ module: 'baileys' })),
    },
    logger: logger.child({ module: 'baileys' }),
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '120.0.0'],
    connectTimeoutMs: CONNECT_TIMEOUT_MS,
    keepAliveIntervalMs: KEEP_ALIVE_INTERVAL_MS,
    defaultQueryTimeoutMs: QUERY_TIMEOUT_MS,
    retryRequestDelayMs: RETRY_REQUEST_DELAY_MS,
    maxMsgRetryCount: MAX_MSG_RETRY_COUNT,
    // Obligatoire à partir de Baileys 7.0.0 pour un fonctionnement fiable
    // des retries, du déchiffrement des votes de sondage et des messages
    // cités (voir sentMessageStore.js, alimenté par outboundGateway.js).
    // Ne couvre que les messages ENVOYÉS PAR LE BOT — un message reçu
    // qu'on n'a pas nous-mêmes envoyé reste hors de portée de ce cache,
    // ce qui correspond à l'usage réel que Baileys en fait.
    // IMPORTANT (Baileys 7.x) : si ni syncFullHistory ni shouldSyncHistoryMessage
    // ne sont précisés, Baileys applique en interne
    // `shouldSyncHistoryMessage = () => !!syncFullHistory` — comme
    // syncFullHistory est alors undefined (donc faux), ça désactive
    // SILENCIEUSEMENT tout sync d'historique, y compris le "bootstrap" initial
    // nécessaire à WhatsApp pour envoyer les données de routage des groupes et
    // les correspondances @lid. Plusieurs bugs documentés sur Baileys 7.x
    // décrivent exactement ce symptôme : les tout premiers messages après un
    // appairage frais ne sont jamais routés (signalé sur ce bot : "je ne reçois
    // pas les premiers messages quand je me connecte pour la première fois").
    // On force explicitement ce sync plutôt que de dépendre d'une valeur par
    // défaut qui a changé de comportement entre les versions.
    syncFullHistory: true,
    shouldSyncHistoryMessage: () => true,
    getMessage: async (key) => getSentContent(key.id),
  });

  // Branché ici, avant toute utilisation de sock.sendMessage (y compris par
  // handlePairingCode) : tous les envois sortants du bot, quelle que soit la
  // commande qui les déclenche, passent par la file d'attente + simulation
  // de frappe (voir core/outboundGateway.js).
  wrapSocketWithOutboundGateway(sock);

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

  readyCalled = false;

  // Un peu d'aléatoire (jitter) pour éviter un motif de reconnexion trop
  // régulier/mécanique, qui est justement ce que les systèmes anti-spam
  // de WhatsApp repèrent. Le backoff continue de croître avec le nombre de
  // tentatives mais reste plafonné à MAX_RECONNECT_DELAY_MS — au-delà de
  // RECONNECT_BACKOFF_CAP_ATTEMPTS on ne fait plus qu'attendre le délai max,
  // on ne s'arrête jamais tout seul pour "trop de tentatives".
  const jitter = Math.random() * 0.3 + 0.85; // entre 0.85x et 1.15x
  const cappedAttempts = Math.min(reconnectAttempts, RECONNECT_BACKOFF_CAP_ATTEMPTS);
  const delay = immediate
    ? 0
    : Math.min(
        MAX_RECONNECT_DELAY_MS,
        Math.round(BASE_RECONNECT_DELAY_MS * 2 ** cappedAttempts * jitter)
      );

  reconnectAttempts += 1;

  if (delay > 0) {
    logger.warn(
      `Reconnexion dans ${Math.round(delay / 1000)}s (tentative ${reconnectAttempts})...`
    );
  }

  setTimeout(() => {
    if (stopped) return;
    // startBaileysClient() ne rejette plus jamais : en cas d'échec (réseau,
    // etc.) elle planifie elle-même une nouvelle tentative via ce même
    // scheduleReconnect. Rien à rattraper ici.
    startBaileysClient(onReady);
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

    // Propriétaire du bot = JID sur lequel on vient de se connecter, lu en
    // direct sur le socket. Jamais stocké : redéfini à chaque connexion,
    // donc toujours exact même après un ré-appairage sur un autre numéro
    // (voir core/adminStore.js). On passe `sock` entier (pas juste
    // sock.user?.id) pour que setOwnerJid puisse capturer aussi la forme
    // @lid du propriétaire, pas seulement sa forme @s.whatsapp.net —
    // WhatsApp peut rapporter l'auteur d'une action sous l'une ou l'autre
    // forme selon le contexte (voir setOwnerJid dans adminStore.js).
    setOwnerJid(sock);

    // Marque l'heure de CETTE connexion : sert à ignorer les messages de
    // rattrapage (envoyés pendant que le bot était hors ligne, redélivrés
    // par WhatsApp à la reconnexion) dans handlers/messageHandler.js.
    markConnectedNow();
    logger.info(`connectedAt fixé à ${new Date().toISOString()} — tout message antérieur sera ignoré au rattrapage.`);

    // La session vient de servir à se connecter : c'est le meilleur moment
    // possible pour la sauvegarder, on est certain qu'elle est valide.
    backupSessionIfValid();
    if (!periodicBackupHandle) {
      periodicBackupHandle = setInterval(backupSessionIfValid, PERIODIC_BACKUP_INTERVAL_MS);
      periodicBackupHandle.unref?.(); // ne doit pas empêcher le process de s'arrêter proprement
    }

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
    if (periodicBackupHandle) {
      clearInterval(periodicBackupHandle);
      periodicBackupHandle = null;
    }

    const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;

    // Seul loggedOut est un signal définitif et non-ambigu envoyé par
    // WhatsApp lui-même : l'appareil a été explicitement délié (déconnexion
    // manuelle depuis le téléphone, ou expiration réelle de la session).
    // Dans TOUS les autres cas (badSession/500, connectionReplaced,
    // multideviceMismatch, restartRequired, erreurs de stream, etc.), on
    // continue de retenter automatiquement avec le backoff exponentiel —
    // ces codes peuvent être transitoires (erreur réseau, glitch du
    // handshake Noise, redémarrage du serveur WhatsApp côté eux) et
    // s'arrêter dessus abandonnerait le bot pour rien.
    const loggedOut = statusCode === DisconnectReason.loggedOut;

    if (loggedOut) {
      haltReconnection(`Session déconnectée définitivement par WhatsApp (code ${statusCode}).`);
      return;
    }

    const restartRequired = statusCode === DisconnectReason.restartRequired;

    logger.warn(`Connexion perdue (code ${statusCode ?? 'inconnu'}) — nouvelle tentative automatique.`);
    scheduleReconnect(onReady, restartRequired);
  }
}