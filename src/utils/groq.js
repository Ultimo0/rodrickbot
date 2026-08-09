import { config } from '../config/index.js';
import { logger } from './logger.js';

export const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MAX_RETRIES = 2;
const GROQ_TIMEOUT_MS = 20_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitErrorMessage(message = '') {
  return /429|rate limit|rate_limited/i.test(message);
}

function rateLimitFallbackMessage() {
  return '⚠️ L’API Groq est actuellement limitée (rate limit). Réessaie dans quelques instants ou utilise une commande historique du bot.';
}

// 402 = Payment Required : le compte Groq n'a plus de crédit disponible (ou
// a dépassé son plafond de facturation). Ce n'est pas un bug du bot —
// message clair pour que le propriétaire sache qu'il faut recharger le
// compte, plutôt que de laisser fuiter un "Erreur API Groq (402)." sec.
function isInsufficientBalanceErrorMessage(message = '') {
  return /\(402\)/.test(message);
}

function insufficientBalanceFallbackMessage() {
  return '⚠️ Le compte Groq n’a plus de crédit disponible (paiement requis). Recharge le compte sur console.groq.com pour réactiver l’IA.';
}

/**
 * Appel générique vers l'API Groq, avec retry/backoff sur 429 et un
 * timeout réseau (sinon un message resterait bloqué indéfiniment si l'API
 * ne répond jamais). Réutilisé par toutes les fonctions de ce fichier ET
 * par la détection d'intention de l'agent (agent/agentService.js) — un
 * seul endroit à faire évoluer pour la résilience réseau.
 *
 * Important : en cas d'erreur HTTP, le corps de la réponse upstream
 * (`errText`) n'est JAMAIS inclus dans le message d'erreur remonté à
 * l'appelant — seulement dans les logs serveur — car ce message peut
 * finir affiché tel quel côté utilisateur WhatsApp (voir agentService.js).
 */
export async function requestGroqJson(url, payload, { retries = GROQ_MAX_RETRIES } = {}) {
  let attempt = 0;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.groqApiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Erreur API Groq : délai de réponse dépassé.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (res.ok) {
      return res.json();
    }

    const errText = await res.text().catch(() => '');
    logger.warn({ status: res.status, url, errText }, 'Erreur API Groq (détail upstream, non exposé à l’utilisateur)');

    if (res.status === 429 && attempt < retries) {
      const delay = 750 * (attempt + 1);
      attempt += 1;
      await sleep(delay);
      continue;
    }

    throw new Error(`Erreur API Groq (${res.status}).`);
  }

  throw new Error('Erreur API Groq : limite de retry dépassée.');
}

/**
 * Envoie une question à l'API Groq et retourne la réponse texte.
 * @param {string} question
 * @returns {Promise<string>}
 */
export async function askGroq(question) {
  if (!config.groqApiKey) {
    throw new Error('Clé API Groq manquante (GROQ_API_KEY dans .env).');
  }

  try {
    const json = await requestGroqJson(GROQ_CHAT_URL, {
      model: config.groqModel,
      messages: [
        {
          role: 'system',
          content:
            "Tu es un assistant intégré à un bot WhatsApp. Réponds de façon claire, concise et utile, en français sauf si on te parle dans une autre langue.",
        },
        { role: 'user', content: question },
      ],
      temperature: 0.7,
    });

    const answer = json?.choices?.[0]?.message?.content;
    if (!answer) {
      throw new Error('Réponse vide reçue de Groq.');
    }

    return answer.trim();
  } catch (err) {
    if (isInsufficientBalanceErrorMessage(err.message)) {
      return insufficientBalanceFallbackMessage();
    }
    if (isRateLimitErrorMessage(err.message)) {
      return rateLimitFallbackMessage();
    }
    throw err;
  }
}

/**
 * Extrait le texte visible d'une image via un modèle de vision Groq
 * (contrairement à Mistral, Groq n'a pas d'endpoint OCR dédié — on passe
 * par le chat completions habituel avec une image en entrée, sur un
 * modèle multimodal). Voir config.groqVisionModel (settings.json) : la
 * disponibilité des modèles vision change assez vite chez Groq, ajuster
 * ce réglage si ça cesse de fonctionner (https://console.groq.com/docs/vision).
 * @param {Buffer} imageBuffer
 * @param {string} mimeType ex: 'image/jpeg'
 * @returns {Promise<string>} le texte extrait, ou chaîne vide si aucun texte détecté
 */
export async function ocrImage(imageBuffer, mimeType) {
  if (!config.groqApiKey) {
    throw new Error('Clé API Groq manquante (GROQ_API_KEY dans .env).');
  }

  const dataUri = `data:${mimeType || 'image/jpeg'};base64,${imageBuffer.toString('base64')}`;

  try {
    const json = await requestGroqJson(GROQ_CHAT_URL, {
      model: config.groqVisionModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                "Transcris intégralement et fidèlement tout le texte visible dans cette image, sans " +
                'commentaire ni description de l\'image, uniquement le texte tel quel (conserve la mise ' +
                "en forme/les retours à la ligne si pertinent). Si aucun texte n'est visible, réponds " +
                'uniquement avec une chaîne vide.',
            },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
      temperature: 0,
    });

    const text = json?.choices?.[0]?.message?.content;
    return (text || '').trim();
  } catch (err) {
    if (isInsufficientBalanceErrorMessage(err.message)) {
      return insufficientBalanceFallbackMessage();
    }
    if (isRateLimitErrorMessage(err.message)) {
      return rateLimitFallbackMessage();
    }
    throw err;
  }
}

/**
 * Instructions de résumé par taille, utilisées par summarizeText() et par
 * la commande !resume pour valider la taille demandée.
 */
export const SUMMARY_SIZES = {
  court: "Résume ce texte en 2 à 3 phrases maximum, en ne gardant que l'essentiel. Réponds uniquement avec le résumé, sans préambule ni titre.",
  moyen: "Résume ce texte en un paragraphe clair d'environ 5 à 8 phrases. Réponds uniquement avec le résumé, sans préambule ni titre.",
  détaillé:
    "Fais un résumé détaillé de ce texte, organisé en quelques sections avec un titre en gras par section (*Titre*), suivi de puces simples sur un seul niveau (une ligne commençant par « • » par point, jamais de sous-puces imbriquées). Reste concis par point. N'utilise aucune autre mise en forme markdown que le gras (*texte*), car WhatsApp ne supporte que ça. Réponds uniquement avec le résumé, sans préambule ni titre général.",
};

/**
 * Résume un texte via l'API Groq, à la taille demandée.
 * @param {string} text
 * @param {'court'|'moyen'|'détaillé'} size
 * @returns {Promise<string>}
 */
export async function summarizeText(text, size = 'moyen') {
  if (!config.groqApiKey) {
    throw new Error('Clé API Groq manquante (GROQ_API_KEY dans .env).');
  }

  const instruction = SUMMARY_SIZES[size] || SUMMARY_SIZES.moyen;

  try {
    const json = await requestGroqJson(GROQ_CHAT_URL, {
      model: config.groqModel,
      messages: [
        {
          role: 'system',
          content: `Tu es un assistant de résumé intégré à un bot WhatsApp. ${instruction} Réponds dans la même langue que le texte fourni (français par défaut).`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.3,
    });

    const summary = json?.choices?.[0]?.message?.content;
    if (!summary) {
      throw new Error('Réponse vide reçue de Groq.');
    }

    return summary.trim();
  } catch (err) {
    if (isInsufficientBalanceErrorMessage(err.message)) {
      return insufficientBalanceFallbackMessage();
    }
    if (isRateLimitErrorMessage(err.message)) {
      return rateLimitFallbackMessage();
    }
    throw err;
  }
}

/**
 * Corrige l'orthographe, la grammaire, la ponctuation et le style d'un
 * texte via l'API Groq, sans en changer le sens.
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function correctText(text) {
  if (!config.groqApiKey) {
    throw new Error('Clé API Groq manquante (GROQ_API_KEY dans .env).');
  }

  try {
    const json = await requestGroqJson(GROQ_CHAT_URL, {
      model: config.groqModel,
      messages: [
        {
          role: 'system',
          content:
            "Tu es un correcteur intégré à un bot WhatsApp. Corrige l'orthographe, la grammaire, la ponctuation et le style du texte fourni, sans en changer le sens, le contenu, ni la longueur générale — n'ajoute et ne supprime aucune information. Garde la même langue que le texte original et sa mise en forme (retours à la ligne, paragraphes). Réponds uniquement avec le texte corrigé, sans aucun commentaire, explication, ou guillemets autour.",
        },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
    });

    const corrected = json?.choices?.[0]?.message?.content;
    if (!corrected) {
      throw new Error('Réponse vide reçue de Groq.');
    }

    return corrected.trim();
  } catch (err) {
    if (isInsufficientBalanceErrorMessage(err.message)) {
      return insufficientBalanceFallbackMessage();
    }
    if (isRateLimitErrorMessage(err.message)) {
      return rateLimitFallbackMessage();
    }
    throw err;
  }
}

/**
 * Traduit un texte vers la langue demandée via l'API Groq, en détectant
 * automatiquement la langue d'origine.
 * @param {string} text
 * @param {string} targetLanguage ex: 'anglais', 'espagnol'
 * @returns {Promise<string>}
 */
export async function translateText(text, targetLanguage) {
  if (!config.groqApiKey) {
    throw new Error('Clé API Groq manquante (GROQ_API_KEY dans .env).');
  }

  try {
    const json = await requestGroqJson(GROQ_CHAT_URL, {
      model: config.groqModel,
      messages: [
        {
          role: 'system',
          content: `Tu es un traducteur intégré à un bot WhatsApp. Détecte automatiquement la langue du texte fourni, puis traduis-le en ${targetLanguage}. Conserve le ton, le style et la mise en forme (retours à la ligne, paragraphes) du texte original. Réponds uniquement avec le texte traduit, sans aucun commentaire, explication, ni guillemets autour.`,
        },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
    });

    const translated = json?.choices?.[0]?.message?.content;
    if (!translated) {
      throw new Error('Réponse vide reçue de Groq.');
    }

    return translated.trim();
  } catch (err) {
    if (isInsufficientBalanceErrorMessage(err.message)) {
      return insufficientBalanceFallbackMessage();
    }
    if (isRateLimitErrorMessage(err.message)) {
      return rateLimitFallbackMessage();
    }
    throw err;
  }
}
