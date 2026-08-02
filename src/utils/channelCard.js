import { Jimp, JimpMime } from 'jimp';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from './logger.js';

const ASSETS_DIR = path.join(process.cwd(), 'assets');
const LOGO_CANDIDATES = ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp'];
const THUMBNAIL_SIZE = 48; // px — logo très petit (utilisé pour un aperçu type lien)
const BANNER_MAX_SIZE = 720; // px — taille raisonnable pour une image de menu
export const CHANNEL_URL = 'https://whatsapp.com/channel/0029VbCDXki59PwNcJW60G39';

let cachedThumbnail;
let cachedBanner;

function findLogoPath() {
  for (const filename of LOGO_CANDIDATES) {
    const fullPath = path.join(ASSETS_DIR, filename);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

async function loadThumbnail() {
  if (cachedThumbnail !== undefined) return cachedThumbnail;

  const logoPath = findLogoPath();
  if (!logoPath) {
    logger.warn(
      `Aucun logo trouvé dans assets/ (attendu: ${LOGO_CANDIDATES.join(', ')}) — carte envoyée sans miniature`
    );
    cachedThumbnail = null;
    return cachedThumbnail;
  }

  try {
    const image = await Jimp.read(logoPath);
    image.cover({ w: THUMBNAIL_SIZE, h: THUMBNAIL_SIZE });
    cachedThumbnail = await image.getBuffer(JimpMime.jpeg);
  } catch (err) {
    logger.warn({ err }, 'Erreur lors du traitement du logo — carte envoyée sans miniature');
    cachedThumbnail = null;
  }
  return cachedThumbnail;
}

/** Charge le logo en taille "bannière" (non recadré en carré, juste limité en taille). */
async function loadBanner() {
  if (cachedBanner !== undefined) return cachedBanner;

  const logoPath = findLogoPath();
  if (!logoPath) {
    logger.warn(
      `Aucun logo trouvé dans assets/ (attendu: ${LOGO_CANDIDATES.join(', ')}) — menu envoyé sans image`
    );
    cachedBanner = null;
    return cachedBanner;
  }

  try {
    const image = await Jimp.read(logoPath);
    image.scaleToFit({ w: BANNER_MAX_SIZE, h: BANNER_MAX_SIZE });
    cachedBanner = await image.getBuffer(JimpMime.jpeg);
  } catch (err) {
    logger.warn({ err }, 'Erreur lors du traitement de la bannière — menu envoyé sans image');
    cachedBanner = null;
  }
  return cachedBanner;
}

/**
 * Envoie un message contenant le texte (menu, etc.) suivi du lien de la
 * chaîne WhatsApp. Si `asImage` est vrai et qu'un logo existe dans
 * assets/, le texte est envoyé comme légende d'une image ; sinon (ou en
 * l'absence de logo) le message reste un texte simple, comme avant.
 */
export async function sendWithChannelCard(ctx, text, { asImage = false } = {}) {
  const fullText = `${text}\n\n🔗 Chaîne WhatsApp: ${CHANNEL_URL}`;

  if (asImage) {
    const banner = await loadBanner();
    if (banner) {
      await ctx.sock.sendMessage(ctx.chatId, { image: banner, caption: fullText }, { quoted: ctx.msg });
      return;
    }
  }

  await ctx.sock.sendMessage(ctx.chatId, { text: fullText }, { quoted: ctx.msg });
}