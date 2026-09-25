import sharp from 'sharp';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from './logger.js';
import { config } from '../config/index.js';

const ASSETS_DIR = path.join(process.cwd(), 'assets');
const LOGO_CANDIDATES = ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp'];
const BANNER_MAX_SIZE = 720; // px — taille raisonnable pour une image de menu

let cachedBanner;

/**
 * contextInfo à injecter dans un message pour qu'il apparaisse dans WhatsApp
 * comme "Transféré depuis" la chaîne officielle du bot (badge natif), au
 * lieu d'envoyer un second message avec le lien de la chaîne.
 *
 * `serverMessageId` n'a pas besoin de correspondre à un vrai message publié
 * sur la chaîne : WhatsApp l'utilise seulement pour l'affichage du badge de
 * transfert, pas pour retrouver un message précis.
 */
function buildChannelForwardContext() {
  if (!config.channelJid) return undefined;

  return {
    isForwarded: true,
    forwardingScore: 9999,
    forwardedNewsletterMessageInfo: {
      newsletterJid: config.channelJid,
      newsletterName: config.botName ? `${config.botName} — Chaîne officielle` : 'Chaîne officielle',
      serverMessageId: 1,
    },
  };
}

function findLogoPath() {
  for (const filename of LOGO_CANDIDATES) {
    const fullPath = path.join(ASSETS_DIR, filename);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
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
 * Expose le contextInfo "transféré depuis la chaîne" brut, pour les
 * modules qui construisent eux-mêmes leur message (ex: interactiveMenu.js,
 * qui doit l'injecter dans un `listMessage.contextInfo` et non dans un
 * `sock.sendMessage` classique).
 */
export function getChannelForwardContext() {
  return buildChannelForwardContext();
}

/**
 * Envoie uniquement la bannière (logo de assets/) marquée "transféré
 * depuis la chaîne", sans texte. Utile quand le contenu principal du menu
 * part ensuite sous une forme qui ne supporte pas nativement une image
 * d'en-tête (ex: `listMessage`, voir utils/interactiveMenu.js) : on envoie
 * la photo en premier message, puis le menu lui-même juste après, plutôt
 * que de perdre l'image. Ne fait rien (retourne false) si aucun logo
 * n'est configuré dans assets/ — jamais d'erreur bloquante pour ça.
 */
export async function sendChannelBanner(ctx, caption) {
  const banner = await loadBanner();
  if (!banner) return false;

  const contextInfo = buildChannelForwardContext();
  await ctx.sock.sendMessage(ctx.chatId, { image: banner, caption, contextInfo }, { quoted: ctx.msg });
  return true;
}

/**
 * Variante de sendWithChannelCard qui ne dépend pas d'un ctx de commande —
 * utile pour les messages envoyés par le bot lui-même en dehors du cycle
 * commande/réponse (ex: message de bienvenue/départ, qui n'a pas de
 * message "déclencheur" d'un utilisateur à quoter). `content` est fusionné
 * tel quel avec le contextInfo — accepte donc aussi bien { text } que
 * { text, mentions } ou toute autre forme acceptée par sock.sendMessage.
 */
export async function sendChannelMessage(sock, chatId, content) {
  const contextInfo = buildChannelForwardContext();
  await sock.sendMessage(chatId, { ...content, contextInfo });
}

/**
 * Envoie un message (menu, ping, etc.) marqué comme provenant de la chaîne
 * WhatsApp officielle du bot (badge natif "Transféré depuis"), en un seul
 * message — plus de second message avec le lien de la chaîne. Si `asImage`
 * est vrai et qu'un logo existe dans assets/, le texte est envoyé comme
 * légende d'une image ; sinon (ou en l'absence de logo) le message reste un
 * texte simple.
 */
export async function sendWithChannelCard(ctx, text, { asImage = false } = {}) {
  const contextInfo = buildChannelForwardContext();

  if (asImage) {
    const banner = await loadBanner();
    if (banner) {
      await ctx.sock.sendMessage(
        ctx.chatId,
        { image: banner, caption: text, contextInfo },
        { quoted: ctx.msg }
      );
      return;
    }
  }

  await ctx.sock.sendMessage(ctx.chatId, { text, contextInfo }, { quoted: ctx.msg });
}