import { config } from '../config/index.js';
import { getGroupSettings } from '../core/groupSettings.js';
import { translateText } from './groq.js';
import { isGroup } from './helpers.js';
import { logger } from './logger.js';

/**
 * Traduit automatiquement chaque message texte d'un groupe vers la langue
 * configurée par {prefix}traduireauto, et renvoie la traduction en
 * réponse citée — sans jamais bloquer le reste du pipeline (contrairement
 * à handleAntilink/handleLinkWhitelist, un message traduit n'est jamais
 * "consommé" : il continue normalement vers le parsing de commande, pour
 * que !traduireauto n'empêche jamais les autres commandes de fonctionner
 * dans le même groupe).
 *
 * Ignore volontairement :
 * - les messages qui commencent par le préfixe (une commande n'a pas à
 *   être traduite) ;
 * - les textes vides, trop courts (< 2 caractères) ou purement numériques
 *   /emoji (peu de valeur à traduire, et évite de gaspiller des appels API
 *   sur "👍" ou "+1").
 */
export async function handleAutotranslate(sock, msg, chatId, sender, text) {
  if (!isGroup(chatId) || !text) return;
  if (text.startsWith(config.prefix)) return;

  const trimmed = text.trim();
  if (trimmed.length < 2) return;
  if (!/[a-zA-Zà-üÀ-Ü]{2,}/.test(trimmed)) return; // pas de contenu textuel exploitable

  const settings = getGroupSettings(chatId);
  if (!settings.autotranslate.enabled || !settings.autotranslate.targetLang) return;

  try {
    const translated = await translateText(trimmed, settings.autotranslate.targetLang);
    // Rien à afficher si la traduction est (quasi) identique à l'original
    // (texte déjà dans la langue cible) — évite du bruit inutile dans le
    // groupe à chaque message.
    if (translated.trim().toLowerCase() === trimmed.toLowerCase()) return;

    await sock.sendMessage(
      chatId,
      { text: `🌐 _Traduction (${settings.autotranslate.targetLang})_\n${translated}` },
      { quoted: msg }
    );
  } catch (err) {
    logger.warn({ err }, 'Traduction automatique impossible pour ce message');
  }
}
