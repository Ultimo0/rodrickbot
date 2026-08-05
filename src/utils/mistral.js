import { config } from '../config/index.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_OCR_URL = 'https://api.mistral.ai/v1/ocr';
const MISTRAL_MAX_RETRIES = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitErrorMessage(message = '') {
  return /429|rate limit|rate_limited|1300/i.test(message);
}

function rateLimitFallbackMessage() {
  return '⚠️ L’API Mistral est actuellement limitée (rate limit). Réessaie dans quelques instants ou utilise une commande historique du bot.';
}

async function requestMistralJson(url, payload, { retries = MISTRAL_MAX_RETRIES } = {}) {
  let attempt = 0;

  while (attempt <= retries) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.mistralApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return res.json();
    }

    const errText = await res.text().catch(() => '');
    const message = `Erreur API Mistral (${res.status}) ${errText}`.trim();

    if (res.status === 429 && attempt < retries) {
      const delay = 750 * (attempt + 1);
      attempt += 1;
      await sleep(delay);
      continue;
    }

    throw new Error(message);
  }

  throw new Error('Erreur API Mistral : limite de retry dépassée.');
}

/**
 * Envoie une question à l'API Mistral et retourne la réponse texte.
 * @param {string} question
 * @returns {Promise<string>}
 */
export async function askMistral(question) {
  if (!config.mistralApiKey) {
    throw new Error("Clé API Mistral manquante (MISTRAL_API_KEY dans .env).");
  }

  try {
    const json = await requestMistralJson(MISTRAL_API_URL, {
      model: config.mistralModel,
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
      throw new Error('Réponse vide reçue de Mistral.');
    }

    return answer.trim();
  } catch (err) {
    if (isRateLimitErrorMessage(err.message)) {
      return rateLimitFallbackMessage();
    }
    throw err;
  }
}

/**
 * Extrait le texte visible d'une image via l'API OCR dédiée de Mistral
 * (endpoint /v1/ocr, modèle mistral-ocr-latest — bien plus fiable pour ça
 * qu'un modèle de chat classique).
 * @param {Buffer} imageBuffer
 * @param {string} mimeType ex: 'image/jpeg'
 * @returns {Promise<string>} le texte extrait, ou chaîne vide si aucun texte détecté
 */
export async function ocrImage(imageBuffer, mimeType) {
  if (!config.mistralApiKey) {
    throw new Error("Clé API Mistral manquante (MISTRAL_API_KEY dans .env).");
  }

  const dataUri = `data:${mimeType || 'image/jpeg'};base64,${imageBuffer.toString('base64')}`;

  try {
    const json = await requestMistralJson(MISTRAL_OCR_URL, {
      model: 'mistral-ocr-latest',
      document: {
        type: 'image_url',
        image_url: dataUri,
      },
    });

    const text = (json?.pages || [])
      .map((page) => page.markdown || '')
      .join('\n\n')
      .trim();

    return text;
  } catch (err) {
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
 * Résume un texte via l'API Mistral, à la taille demandée.
 * @param {string} text
 * @param {'court'|'moyen'|'détaillé'} size
 * @returns {Promise<string>}
 */
export async function summarizeText(text, size = 'moyen') {
  if (!config.mistralApiKey) {
    throw new Error("Clé API Mistral manquante (MISTRAL_API_KEY dans .env).");
  }

  const instruction = SUMMARY_SIZES[size] || SUMMARY_SIZES.moyen;

  try {
    const json = await requestMistralJson(MISTRAL_API_URL, {
      model: config.mistralModel,
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
      throw new Error('Réponse vide reçue de Mistral.');
    }

    return summary.trim();
  } catch (err) {
    if (isRateLimitErrorMessage(err.message)) {
      return rateLimitFallbackMessage();
    }
    throw err;
  }
}

/**
 * Corrige l'orthographe, la grammaire, la ponctuation et le style d'un
 * texte via l'API Mistral, sans en changer le sens.
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function correctText(text) {
  if (!config.mistralApiKey) {
    throw new Error("Clé API Mistral manquante (MISTRAL_API_KEY dans .env).");
  }

  try {
    const json = await requestMistralJson(MISTRAL_API_URL, {
      model: config.mistralModel,
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
      throw new Error('Réponse vide reçue de Mistral.');
    }

    return corrected.trim();
  } catch (err) {
    if (isRateLimitErrorMessage(err.message)) {
      return rateLimitFallbackMessage();
    }
    throw err;
  }
}

/**
 * Traduit un texte vers la langue demandée via l'API Mistral, en
 * détectant automatiquement la langue d'origine.
 * @param {string} text
 * @param {string} targetLanguage ex: 'anglais', 'espagnol'
 * @returns {Promise<string>}
 */
export async function translateText(text, targetLanguage) {
  if (!config.mistralApiKey) {
    throw new Error("Clé API Mistral manquante (MISTRAL_API_KEY dans .env).");
  }

  try {
    const json = await requestMistralJson(MISTRAL_API_URL, {
      model: config.mistralModel,
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
      throw new Error('Réponse vide reçue de Mistral.');
    }

    return translated.trim();
  } catch (err) {
    if (isRateLimitErrorMessage(err.message)) {
      return rateLimitFallbackMessage();
    }
    throw err;
  }
}