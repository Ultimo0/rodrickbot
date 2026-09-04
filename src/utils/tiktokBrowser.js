import { chromium } from 'playwright';
import { logger } from './logger.js';

const NAV_TIMEOUT_MS = 25_000;

/**
 * Repli GRATUIT pour /tiktok quand yt-dlp échoue avec une erreur de
 * structure de page cassée ("rehydration"/"webpage video data"). Contexte
 * complet : voir le commentaire au-dessus de fetchTikTokData() dans
 * tiktok.js.
 *
 * Pourquoi un navigateur headless plutôt qu'une autre API tierce comme
 * tikwm.com (déjà tenté, cf CHANGELOG 1.32.0) : toutes les alternatives
 * "gratuites" équivalentes sont soit devenues payantes depuis, soit
 * protégées par un anti-bot qui nécessite lui-même un service payant pour
 * être contourné — reproduire ce schéma recréerait juste le même problème
 * avec une deuxième dépendance fragile. Un vrai Chromium headless, en
 * revanche, charge la page COMME un navigateur réel et lit simplement où
 * atterrit l'URL de la vidéo une fois affichée — indépendant du bloc JSON
 * précis que TikTok déplace/renomme régulièrement côté HTML brut, donc
 * moins sujet à casser en même temps que yt-dlp.
 *
 * Contrepartie assumée : nettement plus lourd en RAM/CPU qu'une requête
 * HTTP — c'est pourquoi ce n'est utilisé QU'en dernier recours, jamais
 * comme méthode par défaut (voir fetchTikTokData).
 */
export async function extractTikTokViaBrowser(url) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      // --disable-dev-shm-usage : évite les plantages liés à la taille de
      // /dev/shm sur les hébergements contraints (cause fréquente de crash
      // silencieux de Chromium headless en environnement limité).
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage({
      // Se présenter comme un téléphone plutôt qu'un desktop : la version
      // mobile de TikTok est généralement plus simple/plus tolérante.
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      viewport: { width: 390, height: 844 },
    });
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

    // Attend qu'une vraie balise <video> apparaisse dans le DOM RENDU —
    // c'est ce qu'un navigateur affiche réellement à l'écran, peu importe
    // la structure JSON que TikTok fait varier côté source HTML.
    await page.waitForSelector('video', { timeout: NAV_TIMEOUT_MS });

    const { videoUrl, title } = await page.evaluate(() => {
      const videoEl = document.querySelector('video');
      const titleEl = document.querySelector('meta[property="og:title"]');
      return {
        videoUrl: videoEl?.currentSrc || videoEl?.src || null,
        title: titleEl?.content || document.title || 'tiktok',
      };
    });

    if (!videoUrl) {
      throw new Error('Aucune vidéo trouvée sur la page rendue par le navigateur.');
    }

    logger.info('[tiktokBrowser] Vidéo récupérée via navigateur headless.');
    return { title, videoUrl };
  } finally {
    await browser?.close().catch((err) => {
      logger.warn({ err }, '[tiktokBrowser] Fermeture du navigateur en échec (non bloquant)');
    });
  }
}
