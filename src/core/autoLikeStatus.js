/**
 * Réaction automatique aux statuts WhatsApp (!autolike). Persisté sur
 * disque (autolike.json) pour survivre à un redémarrage — sinon la
 * fonctionnalité se réactiverait "off" à chaque redéploiement sans que le
 * propriétaire ne s'en rende compte.
 *
 * Suit le même pattern que viewOnceCache.js : son propre listener
 * 'messages.upsert', initialisé séparément dans src/index.js — pas mêlé au
 * pipeline de commandes de messageHandler.js, puisque ça n'a rien à voir
 * avec une commande envoyée par quelqu'un (les statuts sont un flux à part).
 */

import { readFileSync, existsSync } from 'fs';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';
import { dataFilePath } from '../utils/dataFile.js';
import { logger } from '../utils/logger.js';

const DATA_FILE = dataFilePath('autolike.json');
const DEFAULT_EMOJI = '💚';

let state = { enabled: false, emoji: DEFAULT_EMOJI };

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
    if (typeof raw.enabled === 'boolean') state.enabled = raw.enabled;
    if (typeof raw.emoji === 'string' && raw.emoji) state.emoji = raw.emoji;
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire autolike.json, valeurs par défaut utilisées');
  }
}

function persist() {
  try {
    atomicWriteFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire autolike.json");
  }
}

load();

export function isAutoLikeEnabled() {
  return state.enabled;
}

export function setAutoLikeEnabled(enabled) {
  state.enabled = enabled;
  persist();
}

export function getAutoLikeEmoji() {
  return state.emoji;
}

export function setAutoLikeEmoji(emoji) {
  state.emoji = emoji;
  persist();
}

export function initAutoLikeStatus(sock) {
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' || !state.enabled) return;

    for (const msg of messages) {
      try {
        // Ne réagit qu'aux statuts (le "chat" spécial status@broadcast),
        // jamais à un message normal. Ignore aussi les propres statuts du
        // bot lui-même (fromMe) : pas de sens à s'auto-liker.
        if (msg.key.remoteJid !== 'status@broadcast' || msg.key.fromMe) continue;
        if (!msg.key.participant) {
          // Sans le JID de la personne qui a posté le statut, Baileys ne
          // peut pas router correctement la réaction (voir statusJidList
          // ci-dessous) — on ignore plutôt que de risquer un envoi cassé.
          logger.warn('Autolike: statut sans participant, ignoré.');
          continue;
        }

        // IMPORTANT : préférer participantAlt (forme numéro, @s.whatsapp.net)
        // à msg.key.participant quand ce dernier est sous la forme @lid.
        // Constaté en prod (bot_2_.log) : établir une session Signal pour
        // réagir à un statut via la forme @lid échoue ("SessionError: No
        // sessions", puis "not-acceptable"/406 côté serveur WhatsApp au
        // 2e essai) quand aucune session n'existe déjà avec cette personne.
        // La forme numéro classique n'a pas cette restriction.
        const targetJid = msg.key.participantAlt || msg.key.participant;

        // Marquer le statut comme "vu" avant de réagir — comportement
        // humain normal (on voit avant de liker), et ça peut aussi lever
        // une validation serveur qui suppose la vue avant la réaction.
        // Best-effort : un échec ici ne doit pas empêcher la réaction.
        try {
          await sock.readMessages([msg.key]);
        } catch (err) {
          logger.warn({ err }, 'Autolike: échec du marquage "vu" (ignoré, on tente la réaction quand même)');
        }

        await sock.sendMessage(
          'status@broadcast',
          { react: { text: state.emoji, key: msg.key } },
          { statusJidList: [targetJid] }
        );
        logger.info(`Autolike: statut de ${targetJid} réagi (${state.emoji}).`);
      } catch (err) {
        // Non-bloquant par choix : un statut qui échoue (déjà expiré, etc.)
        // ne doit jamais empêcher de traiter les suivants.
        logger.warn({ err }, 'Autolike: échec de réaction sur un statut (ignoré)');
      }
    }
  });
}
