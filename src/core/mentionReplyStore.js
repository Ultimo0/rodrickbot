/**
 * Réponse automatique à la mention (!mention) : chaque utilisateur peut
 * enregistrer UN message (texte ou note vocale) renvoyé automatiquement
 * chaque fois qu'il est mentionné (ou cité en réponse) dans un GROUPE —
 * jamais en message privé (voir handlers/messageHandler.js).
 * Persisté sur disque (mention_replies.json + fichiers dans saved_media/)
 * pour survivre à un redémarrage, même principe que core/afkStore.js.
 */

import { readFileSync, existsSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';
import { dataFilePath } from '../utils/dataFile.js';
import { logger } from '../utils/logger.js';

const DATA_FILE = dataFilePath('mention_replies.json');
const MEDIA_DIR = path.join(process.cwd(), 'saved_media');

if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true });

// jid normalisé -> { type: 'text', text } | { type: 'audio', mediaPath, mimetype, ptt }
const replies = new Map();

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
    for (const [jid, entry] of Object.entries(raw)) replies.set(jid, entry);
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire mention_replies.json, valeurs par défaut utilisées');
  }
}

function persist() {
  try {
    atomicWriteFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(replies), null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire mention_replies.json");
  }
}

load();

function deleteMediaFileIfAny(entry, jid) {
  if (entry?.type !== 'audio' || !entry.mediaPath) return;
  const fullPath = path.join(process.cwd(), entry.mediaPath);
  try {
    if (existsSync(fullPath)) unlinkSync(fullPath);
  } catch (err) {
    logger.warn({ err }, `Impossible de supprimer l'ancien média de mention pour ${jid}`);
  }
}

/** Enregistre une réponse texte pour `jid`, remplace toute réponse précédente (texte ou audio). */
export function setMentionReplyText(jid, text) {
  deleteMediaFileIfAny(replies.get(jid), jid);
  replies.set(jid, { type: 'text', text, savedAt: new Date().toISOString() });
  persist();
}

/**
 * Enregistre une réponse audio pour `jid` (buffer déjà converti en OGG/Opus côté
 * appelant si besoin), remplace toute réponse précédente.
 */
export function setMentionReplyAudio(jid, { buffer, mimetype, ptt, seconds }) {
  deleteMediaFileIfAny(replies.get(jid), jid);

  const fileName = `mention_${jid.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.ogg`;
  const filePath = path.join(MEDIA_DIR, fileName);
  atomicWriteFileSync(filePath, buffer);

  replies.set(jid, {
    type: 'audio',
    mediaPath: path.join('saved_media', fileName),
    mimetype: mimetype || 'audio/ogg; codecs=opus',
    ptt: Boolean(ptt),
    seconds: Number(seconds) || undefined,
    savedAt: new Date().toISOString(),
  });
  persist();
}

export function getMentionReply(jid) {
  return replies.get(jid) || null;
}

/** Supprime la réponse enregistrée (et son fichier média s'il y en a un). Renvoie false si rien n'était enregistré. */
export function clearMentionReply(jid) {
  const existing = replies.get(jid);
  if (!existing) return false;
  deleteMediaFileIfAny(existing, jid);
  replies.delete(jid);
  persist();
  return true;
}
