import sharp from 'sharp';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { config } from '../config/index.js';

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
    cachedThumbnail = await sharp(logoPath)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover' })
      .jpeg()
      .toBuffer();
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
    cachedBanner = await sharp(logoPath)
      .resize(BANNER_MAX_SIZE, BANNER_MAX_SIZE, { fit: 'inside' })
      .jpeg()
      .toBuffer();
  } catch (err) {
    logger.warn({ err }, 'Erreur lors du traitement de la bannière — menu envoyé sans image');
    cachedBanner = null;
  }
  return cachedBanner;
}

/**
 * Envoie le lien de la chaîne WhatsApp comme message à part, avec un aperçu
 * de lien explicite. C'est ce qui permet à WhatsApp de reconnaître le lien
 * de chaîne et d'afficher le bouton natif "Voir la chaîne" au lieu du lien
 * brut — ça ne marche pas s'il est noyé dans une légende d'image ou collé
 * à d'autre texte.
 */
async function sendChannelLink(ctx) {
  const thumbnail = await loadThumbnail();

  await ctx.sock.sendMessage(
    ctx.chatId,
    {
      text: CHANNEL_URL,
      linkPreview: {
        'matched-text': CHANNEL_URL,
        title: config.botName ? `${config.botName} — Chaîne officielle` : 'Chaîne WhatsApp officielle',
        ...(thumbnail ? { jpegThumbnail: thumbnail } : {}),
      },
    },
    { quoted: ctx.msg }
  );
}

/**
 * Envoie un message contenant le texte (menu, etc.), puis le lien de la
 * chaîne WhatsApp dans un second message séparé (pour le bouton natif
 * "Voir la chaîne" — voir sendChannelLink). Si `asImage` est vrai et
 * qu'un logo existe dans assets/, le texte est envoyé comme légende d'une
 * image ; sinon (ou en l'absence de logo) le message reste un texte simple.
 */
export async function sendWithChannelCard(ctx, text, { asImage = false } = {}) {
  if (asImage) {
    const banner = await loadBanner();
    if (banner) {
      await ctx.sock.sendMessage(ctx.chatId, { image: banner, caption: text }, { quoted: ctx.msg });
      await sendChannelLink(ctx);
      return;
    }
  }

  await ctx.sock.sendMessage(ctx.chatId, { text }, { quoted: ctx.msg });
  await sendChannelLink(ctx);
}