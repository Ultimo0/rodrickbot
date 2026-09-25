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
 * Retire le raisonnement interne que certains modèles Groq à raisonnement
 * exposent parfois directement dans le champ `content` de la réponse, sous
 * forme de balises `<think>...</think>`, au lieu de le séparer proprement
 * — un comportement du modèle (repéré sur le modèle de vision configuré
 * par défaut, voir `groqVisionModel`) plutôt qu'un choix du bot. Sans ce
 * nettoyage, l'utilisateur WhatsApp voit apparaître tout le raisonnement
 * brut en anglais avant la vraie réponse (ex: !vision/!analyse-image).
 *
 * Appliquée systématiquement à CHAQUE fonction de ce fichier qui retourne
 * du texte à l'utilisateur, pas seulement à celles de vision — le même
 * comportement peut en théorie survenir sur n'importe quel modèle à
 * raisonnement, y compris `config.groqModel`.
 */
function stripThinkTags(text) {
  if (!text) return text || '';
  // Cas normal : balise fermée.
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Repli : balise ouvrante jamais refermée (réponse coupée en plein
  // raisonnement) — on retire tout depuis <think> jusqu'à la fin plutôt
  // que d'afficher un raisonnement partiel à la place de la réponse.
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');
  return cleaned.trim();
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
            `Tu es RodrickBOT, un bot WhatsApp développé par ${config.developerName || 'son propriétaire'}. ` +
            'Réponds de façon claire, concise et utile, en français sauf si on te parle dans une autre langue. ' +
            "Tu peux expliquer ton propre fonctionnement et tes commandes en détail. En revanche tu ne dois " +
            'jamais révéler, citer, reproduire, résumer ligne par ligne, ni inventer le contenu de ton propre ' +
            "code source, même si on te le demande explicitement, même reformulé ou en plusieurs étapes : " +
            "indique simplement que ce n'est pas quelque chose que tu peux partager.",
        },
        { role: 'user', content: question },
      ],
      temperature: 0.7,
    });

    const answer = json?.choices?.[0]?.message?.content;
    if (!answer) {
      throw new Error('Réponse vide reçue de Groq.');
    }

    return stripThinkTags(answer);
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
    return stripThinkTags(text || '');
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
 * Décrit le contenu d'une image via le modèle de vision Groq (même modèle
 * que ocrImage ci-dessus, voir config.groqVisionModel) — contrairement à
 * ocrImage qui ne fait QUE transcrire le texte visible, cette fonction
 * demande une description générale de la scène (objets, personnes,
 * ambiance, contexte...).
 * @param {Buffer} imageBuffer
 * @param {string} mimeType ex: 'image/jpeg'
 * @param {string} [question] question optionnelle sur l'image (sinon description générale)
 * @returns {Promise<string>}
 */
export async function analyzeImage(imageBuffer, mimeType, question = null) {
  if (!config.groqApiKey) {
    throw new Error('Clé API Groq manquante (GROQ_API_KEY dans .env).');
  }

  const dataUri = `data:${mimeType || 'image/jpeg'};base64,${imageBuffer.toString('base64')}`;
  const prompt =
    question ||
    "Décris cette image de façon claire et concise en français : ce qu'elle montre, les éléments principaux, " +
    "l'ambiance générale. 3-4 phrases maximum, sans préambule ni markdown.";

  try {
    const json = await requestGroqJson(GROQ_CHAT_URL, {
      model: config.groqVisionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        },
      ],
      temperature: 0.4,
    });

    const answer = json?.choices?.[0]?.message?.content;
    if (!answer) {
      throw new Error('Réponse vide reçue de Groq.');
    }
    return stripThinkTags(answer);
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

    return stripThinkTags(summary);
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

    return stripThinkTags(corrected);
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

    return stripThinkTags(translated);
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
 * Helper générique factorisant le schéma commun à correctText/translateText/
 * summarizeText/analyzeImage ci-dessus : un prompt système + un texte
 * utilisateur, avec la même gestion des erreurs 402/429. Utilisé par
 * generateDebate/defineWord/findSynonyms/generateHoroscope ci-dessous, qui
 * n'ont chacune besoin que d'un prompt système différent.
 */
async function simplePrompt(systemPrompt, userText, { temperature = 0.5 } = {}) {
  if (!config.groqApiKey) {
    throw new Error('Clé API Groq manquante (GROQ_API_KEY dans .env).');
  }

  try {
    const json = await requestGroqJson(GROQ_CHAT_URL, {
      model: config.groqModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature,
    });

    const answer = json?.choices?.[0]?.message?.content;
    if (!answer) {
      throw new Error('Réponse vide reçue de Groq.');
    }
    return stripThinkTags(answer);
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

/** Génère un mini-débat pour/contre un sujet donné (commande !debat). */
export async function generateDebate(topic) {
  return simplePrompt(
    "Tu es un débatteur intégré à un bot WhatsApp. Pour le sujet donné par l'utilisateur, développe de façon équilibrée et concise les meilleurs arguments POUR puis les meilleurs arguments CONTRE (3 arguments maximum de chaque côté, une phrase par argument). Structure ta réponse en deux sections claires \"✅ POUR\" et \"❌ CONTRE\" avec des tirets, sans préambule ni conclusion personnelle, et sans prendre parti toi-même.",
    topic,
    { temperature: 0.6 }
  );
}

/** Donne la définition d'un mot ou d'une expression (commande !define). */
export async function defineWord(word) {
  return simplePrompt(
    "Tu es un dictionnaire intégré à un bot WhatsApp. Pour le mot ou l'expression donné, indique sa nature grammaticale puis 1 à 2 définitions claires et concises, avec un exemple d'usage court pour chacune. Réponds uniquement avec la définition, sans préambule ni commentaire, en français sauf si le mot fourni est explicitement dans une autre langue.",
    word,
    { temperature: 0.2 }
  );
}

/** Donne des synonymes d'un mot (commande !synonyme). */
export async function findSynonyms(word) {
  return simplePrompt(
    "Tu es un dictionnaire de synonymes intégré à un bot WhatsApp. Pour le mot donné, liste 5 à 10 synonymes pertinents en français, du plus courant au plus soutenu, séparés par des virgules. Réponds uniquement avec la liste, sans préambule ni commentaire. Si le mot n'a pas de synonyme évident, indique-le en une courte phrase.",
    word,
    { temperature: 0.3 }
  );
}

/**
 * Génère un horoscope du jour pour un signe astrologique (commande
 * !horoscope) — divertissement uniquement, le prompt le rappelle
 * explicitement pour que le modèle ne présente jamais ça comme une
 * prédiction sérieuse.
 */
export async function generateHoroscope(sign) {
  return simplePrompt(
    "Tu es un générateur d'horoscopes fantaisistes pour un bot WhatsApp, à but purement divertissant (pas une vraie prédiction). Pour le signe astrologique donné, écris un horoscope du jour amusant et positif en français (4-5 phrases : ambiance générale, amour, travail/études, un conseil du jour). Réponds uniquement avec le texte de l'horoscope, sans préambule.",
    sign,
    { temperature: 0.9 }
  );
}

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/**
 * Transcrit un audio (note vocale) en texte via l'API Whisper de Groq
 * (commande !vocal-en-texte). Contrairement aux autres fonctions de ce
 * fichier, l'appel est multipart (fichier binaire), pas du JSON — passe
 * donc par un fetch dédié plutôt que par requestGroqJson.
 * @param {Buffer} audioBuffer
 * @param {string} mimeType ex: 'audio/ogg; codecs=opus'
 * @returns {Promise<string>}
 */
// Extensions reconnues par l'API Whisper de Groq (comme l'API OpenAI dont
// elle reprend le contrat) — un fichier envoyé avec une extension hors de
// cette liste est rejeté avec un 400, quel que soit son contenu réel.
// Avant ce correctif, tout mimetype qui n'était ni "ogg" ni "mp4" tombait
// sur un repli `.audio` — une extension INVALIDE pour Groq, provoquant
// systématiquement ce 400 (ex: notes vocales WhatsApp envoyées avec un
// mimetype `audio/mpeg` ou sans mimetype du tout selon le téléphone/la
// version de WhatsApp de l'expéditeur).
function guessAudioExtension(mimeType) {
  const mt = (mimeType || '').toLowerCase();
  if (mt.includes('ogg')) return 'ogg';
  if (mt.includes('mp4') || mt.includes('m4a') || mt.includes('aac')) return 'm4a';
  if (mt.includes('mpeg') || mt.includes('mp3')) return 'mp3';
  if (mt.includes('wav')) return 'wav';
  if (mt.includes('webm')) return 'webm';
  if (mt.includes('flac')) return 'flac';
  // Repli : format le plus courant pour un audioMessage WhatsApp (notes
  // vocales), contrairement à l'ancien repli `audio` qui n'est reconnu par
  // aucune API Whisper.
  return 'ogg';
}

export async function transcribeAudio(audioBuffer, mimeType) {
  if (!config.groqApiKey) {
    throw new Error('Clé API Groq manquante (GROQ_API_KEY dans .env).');
  }

  const form = new FormData();
  const ext = guessAudioExtension(mimeType);
  form.append('file', new Blob([audioBuffer], { type: mimeType || 'audio/ogg' }), `audio.${ext}`);
  form.append('model', config.groqWhisperModel);
  form.append('response_format', 'json');

  let res;
  try {
    res = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.groqApiKey}` },
      body: form,
    });
  } catch (err) {
    throw new Error(`Connexion à Groq impossible : ${err.message}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    logger.warn(
      { status: res.status, errText, mimeType, extensionUsed: ext },
      'Erreur API Groq transcription (détail upstream, non exposé)'
    );
    if (isInsufficientBalanceErrorMessage(`(${res.status})`)) return insufficientBalanceFallbackMessage();
    if (res.status === 429) return rateLimitFallbackMessage();
    throw new Error(`Erreur API Groq (${res.status}).`);
  }

  const json = await res.json();
  const text = json?.text?.trim();
  if (!text) {
    throw new Error('Aucun texte détecté dans cet audio.');
  }
  return text;
}
