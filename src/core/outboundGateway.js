/**
 * outboundGateway.js
 * ------------------------------------------------------------------
 * Enveloppe `sock.sendMessage` pour que les envois sortants du bot (peu
 * importe la commande qui les déclenche) passent par une file d'attente.
 * Deux mesures, motivées par les restrictions WhatsApp déjà subies sur ce
 * compte :
 *
 * 1. Espacement aléatoire entre deux envois VERS LA MÊME CONVERSATION
 *    (file d'attente séquentielle PAR chatId, pas globale) : un bot qui
 *    répond à plusieurs messages en rafale dans une même conversation,
 *    sans latence, produit un rythme d'envoi mécanique et régulier — un
 *    des signaux que les systèmes anti-spam de WhatsApp repèrent. On
 *    sérialise donc les envois PAR DESTINATAIRE et on insère un délai
 *    aléatoire entre deux messages consécutifs vers CE MÊME chatId.
 *
 *    Important : une file par chatId, pas une file unique pour tout le
 *    bot. Une version antérieure utilisait une seule file globale — un
 *    groupe très actif ralentissait alors TOUTES les autres conversations,
 *    qui attendaient inutilement derrière des envois qui ne les
 *    concernaient pas. Le signal anti-restriction qu'on veut éviter, c'est
 *    un rythme mécanique DANS une conversation donnée, pas entre deux
 *    conversations sans rapport — les sérialiser ensemble n'apportait
 *    aucune protection supplémentaire, juste de la lenteur perçue.
 *
 * 2. Simulation de frappe ("composing") avant un vrai message texte :
 *    un humain qui répond met un temps proportionnel à la longueur du
 *    message, précédé d'un indicateur "en train d'écrire...". Répondre
 *    instantanément à chaque fois est un signal de bot supplémentaire.
 *    On ne simule PAS la frappe pour les réactions/suppressions : ce ne
 *    sont pas des "messages" au sens humain, et ctx.processing()/success()
 *    doivent rester perçus comme des accusés de réception rapides.
 *
 * Important : ceci RÉDUIT le risque d'être repéré comme automatisation,
 * ça ne l'élimine pas. Baileys reste une bibliothèque non-officielle ;
 * aucune mesure côté code ne garantit l'absence de restriction.
 * ------------------------------------------------------------------
 */

import { logger } from '../utils/logger.js';

// Délai minimum/maximum entre deux envois consécutifs VERS LE MÊME chatId,
// quel que soit leur type (texte, média, réaction, suppression).
// Volontairement aléatoire (pas un intervalle fixe) pour éviter un motif
// régulier.
const MIN_GAP_MS = 700;
const MAX_GAP_MS = 1800;

// Simulation de frappe : temps proportionnel à la longueur du texte,
// borné pour ne jamais devenir gênant sur un message très long ni
// disparaître sur un message très court.
const TYPING_MS_PER_CHAR = 25;
const TYPING_MIN_MS = 400;
const TYPING_MAX_MS = 2500;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Réactions et suppressions ne sont pas des "messages" envoyés par un
// humain qui réfléchit à quoi écrire : pas de simulation de frappe pour
// elles (mais elles restent soumises à l'espacement de la file).
function isPassiveSend(content) {
  return Boolean(content) && (content.react !== undefined || content.delete !== undefined);
}

function extractTypingText(content) {
  if (!content) return null;
  return content.text ?? content.caption ?? null;
}

async function simulateTyping(sock, jid, text) {
  const typingDelay = Math.min(
    TYPING_MAX_MS,
    Math.max(TYPING_MIN_MS, text.length * TYPING_MS_PER_CHAR)
  );

  try {
    await sock.sendPresenceUpdate('composing', jid);
  } catch (err) {
    // Non bloquant : si la présence échoue, on continue quand même vers
    // l'envoi réel du message plutôt que de faire échouer toute la commande.
    logger.warn({ err, jid }, 'outboundGateway: échec presence "composing" (ignoré)');
  }

  await wait(typingDelay);

  try {
    await sock.sendPresenceUpdate('paused', jid);
  } catch {
    // idem, non bloquant
  }
}

/**
 * Remplace sock.sendMessage par une version qui file les envois PAR
 * chatId et simule une frappe humaine avant les vrais messages texte.
 * Doit être appelé une seule fois, juste après la création du socket
 * (voir core/client.js).
 */
export function wrapSocketWithOutboundGateway(sock) {
  const originalSendMessage = sock.sendMessage.bind(sock);

  // Une file (chaîne de promesses) par chatId, pas une seule file globale
  // — voir le commentaire d'en-tête. Deux conversations différentes
  // n'attendent jamais l'une sur l'autre.
  const chains = new Map(); // chatId -> Promise (queue de CE chatId)

  sock.sendMessage = (jid, content, options) => {
    const previous = chains.get(jid) || Promise.resolve();

    const task = previous.then(async () => {
      if (!isPassiveSend(content)) {
        const text = extractTypingText(content);
        if (text) {
          await simulateTyping(sock, jid, text);
        }
      }

      return originalSendMessage(jid, content, options);
    });

    // La suite de la file de CE chatId doit avancer même si CET envoi
    // échoue — sinon une seule erreur bloquerait tous les messages
    // suivants vers cette même conversation. L'erreur elle-même reste
    // bien propagée à l'appelant via `task`.
    const settled = task.catch(() => {}).then(() => wait(randomBetween(MIN_GAP_MS, MAX_GAP_MS)));
    chains.set(jid, settled);

    // Nettoyage : une fois cette file vidée, si aucun nouvel envoi vers ce
    // chatId n'est arrivé entre-temps, on retire l'entrée. Sans ça, la Map
    // grossirait indéfiniment (une clé par chatId déjà croisé une fois,
    // même des mois plus tard) sur un bot qui tourne longtemps et sert
    // beaucoup de groupes/conversations différents.
    settled.then(() => {
      if (chains.get(jid) === settled) chains.delete(jid);
    });

    return task;
  };

  logger.info('outboundGateway: file d\'attente par conversation et simulation de frappe activées sur les envois sortants.');

  return sock;
}
