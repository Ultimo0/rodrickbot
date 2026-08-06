import { writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { readJsonFile, writeJsonFile } from '../utils/jsonStore.js';

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
  items = readJsonFile(DATA_FILE, {}, 'saved_items.json');
}

/** Lève une erreur si l'écriture échoue : !save ne doit pas annoncer un faux succès. */
function persist() {
  writeJsonFile(DATA_FILE, items, 'saved_items.json');
}

/**
 * Applique une modification de `items` et la persiste. Si la persistance
 * échoue, l'état en mémoire est restauré pour rester cohérent avec le
 * disque, puis l'erreur est remontée à l'appelant.
 */
function commit(mutate) {
  const snapshot = { ...items };
  mutate();
  try {
    persist();
  } catch (err) {
    items = snapshot;
    throw err;
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
  if (mediaType === 'audio') {
    // Les audios WhatsApp vocaux sont le plus souvent au format Opus/OGG.
    // Les audios transférés peuvent être MP3, M4A ou OGG. On doit donc
    // conserver l’extension compatible avec le vrai MIME type, pas forcer
    // l’extension OGG pour tout audio.
    const type = String(mimetype || '').toLowerCase();
    if (type.includes('mpeg') || type.includes('mp3')) return 'mp3';
    if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
    if (type.includes('ogg')) return 'ogg';
    if (type.includes('aac')) return 'aac';
    if (type.includes('amr')) return 'amr';
    return 'ogg';
  }
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
  commit(() => {
    items[key] = {
      type: 'text',
      text,
      savedAt: new Date().toISOString(),
      savedBy,
      sourceType, // 'save' ou 'statut' — juste indicatif, même stockage
    };
  });
}

/** Enregistre un média (image/vidéo/audio) sous `name`. */
export function saveMediaItem(name, { mediaType, buffer, mimetype, caption, savedBy, sourceType, ptt = false }) {
  const key = normalize(name);
  const ext = extensionFor(mediaType, mimetype);
  const fileName = `${key}_${Date.now()}.${ext}`;
  const filePath = path.join(MEDIA_DIR, fileName);
  writeFileSync(filePath, buffer);

  try {
    commit(() => {
      items[key] = {
        type: mediaType,
        mediaPath: path.join('saved_media', fileName),
        mimetype: mimetype || null,
        caption: caption || '',
        ptt: Boolean(ptt),
        savedAt: new Date().toISOString(),
        savedBy,
        sourceType,
      };
    });
  } catch (err) {
    // Le média est sur le disque mais n'est référencé nulle part: on évite
    // de laisser un fichier orphelin avant de remonter l'erreur.
    removeMediaFile(filePath, key);
    throw err;
  }
}

function removeMediaFile(fullPath, key) {
  try {
    if (existsSync(fullPath)) unlinkSync(fullPath);
  } catch (err) {
    logger.warn({ err }, `Impossible de supprimer le fichier média pour "${key}"`);
  }
}

/** Supprime un élément (et son fichier média s'il y en a un). Renvoie false si absent. */
export function deleteItem(name) {
  const key = normalize(name);
  const item = items[key];
  if (!item) return false;

  // On retire d'abord l'entrée du catalogue: si la persistance échoue,
  // l'erreur remonte et le fichier média n'a pas encore été supprimé.
  commit(() => {
    delete items[key];
  });

  if (item.mediaPath) {
    removeMediaFile(path.join(process.cwd(), item.mediaPath), key);
  }

  return true;
}
