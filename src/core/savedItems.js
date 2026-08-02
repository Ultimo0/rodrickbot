import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Stockage persistant "clé -> contenu" partagé par les commandes !save et
 * !statut. Les métadonnées (texte, chemin du média, etc.) vivent dans
 * saved_items.json ; les fichiers média eux-mêmes vivent dans saved_media/.
 * C'est volontairement le même magasin pour les deux commandes : peu
 * importe que l'élément vienne d'un statut ou d'un message classique, il
 * est rangé au même endroit et peut être supprimé avec !dell <nom>.
 */

const DATA_FILE = path.join(process.cwd(), 'saved_items.json');
const MEDIA_DIR = path.join(process.cwd(), 'saved_media');

let items = {};

function load() {
  if (!existsSync(DATA_FILE)) return;
  try {
    items = JSON.parse(readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    logger.warn({ err }, 'Impossible de lire saved_items.json, valeurs par défaut utilisées');
  }
}

function persist() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
  } catch (err) {
    logger.error({ err }, "Impossible d'écrire saved_items.json");
  }
}

if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true });

load();

function normalize(name) {
  return name.trim().toLowerCase();
}

function extensionFor(mediaType, mimetype) {
  if (mediaType === 'image') return mimetype?.includes('png') ? 'png' : 'jpg';
  if (mediaType === 'video') return 'mp4';
  if (mediaType === 'audio') return mimetype?.includes('mp4') ? 'm4a' : 'ogg';
  return 'bin';
}

export function hasItem(name) {
  return Object.prototype.hasOwnProperty.call(items, normalize(name));
}

export function getItem(name) {
  return items[normalize(name)] || null;
}

export function listItemNames() {
  return Object.keys(items);
}

/** Enregistre un contenu texte sous `name`. */
export function saveTextItem(name, { text, savedBy, sourceType }) {
  const key = normalize(name);
  items[key] = {
    type: 'text',
    text,
    savedAt: new Date().toISOString(),
    savedBy,
    sourceType, // 'save' ou 'statut' — juste indicatif, même stockage
  };
  persist();
}

/** Enregistre un média (image/vidéo/audio) sous `name`. */
export function saveMediaItem(name, { mediaType, buffer, mimetype, caption, savedBy, sourceType }) {
  const key = normalize(name);
  const ext = extensionFor(mediaType, mimetype);
  const fileName = `${key}_${Date.now()}.${ext}`;
  const filePath = path.join(MEDIA_DIR, fileName);
  writeFileSync(filePath, buffer);

  items[key] = {
    type: mediaType,
    mediaPath: path.join('saved_media', fileName),
    mimetype: mimetype || null,
    caption: caption || '',
    savedAt: new Date().toISOString(),
    savedBy,
    sourceType,
  };
  persist();
}

/** Supprime un élément (et son fichier média s'il y en a un). Renvoie false si absent. */
export function deleteItem(name) {
  const key = normalize(name);
  const item = items[key];
  if (!item) return false;

  if (item.mediaPath) {
    const fullPath = path.join(process.cwd(), item.mediaPath);
    try {
      if (existsSync(fullPath)) unlinkSync(fullPath);
    } catch (err) {
      logger.warn({ err }, `Impossible de supprimer le fichier média pour "${key}"`);
    }
  }

  delete items[key];
  persist();
  return true;
}
