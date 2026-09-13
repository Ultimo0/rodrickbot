import { config } from '../config/index.js';
import { logger } from './logger.js';

const REMOVE_BG_URL = 'https://api.remove.bg/v1.0/removebg';

/**
 * Retire le fond d'une image via l'API remove.bg. Utilise `fetch`/`FormData`/
 * `Blob` natifs de Node.js 20+ (pas de dépendance npm supplémentaire), sur
 * le même principe que requestGroqJson dans utils/groq.js : le corps de la
 * réponse d'erreur upstream n'est jamais renvoyé tel quel à l'utilisateur
 * WhatsApp, seulement loggé côté serveur.
 * @param {Buffer} imageBuffer
 * @returns {Promise<Buffer>} l'image PNG résultante, fond transparent
 */
export async function removeBackground(imageBuffer) {
  if (!config.removeBgApiKey) {
    throw new Error('Clé API remove.bg manquante (REMOVE_BG_API_KEY dans .env).');
  }

  const form = new FormData();
  form.append('image_file', new Blob([imageBuffer]), 'image.png');
  form.append('size', 'auto');

  let res;
  try {
    res = await fetch(REMOVE_BG_URL, {
      method: 'POST',
      headers: { 'X-Api-Key': config.removeBgApiKey },
      body: form,
    });
  } catch (err) {
    throw new Error(`Connexion à remove.bg impossible : ${err.message}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    logger.warn({ status: res.status, errText }, 'Erreur API remove.bg (détail upstream, non exposé à l’utilisateur)');

    if (res.status === 402) {
      throw new Error('Crédit remove.bg épuisé. Recharge le compte sur remove.bg pour continuer.');
    }
    if (res.status === 403) {
      throw new Error('Clé API remove.bg invalide.');
    }
    throw new Error(`Erreur API remove.bg (${res.status}).`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
