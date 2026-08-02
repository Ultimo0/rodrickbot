import { config } from '../config/index.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

/**
 * Envoie une question à l'API Mistral et retourne la réponse texte.
 * @param {string} question
 * @returns {Promise<string>}
 */
export async function askMistral(question) {
  if (!config.mistralApiKey) {
    throw new Error("Clé API Mistral manquante (MISTRAL_API_KEY dans .env).");
  }

  const res = await fetch(MISTRAL_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.mistralApiKey}`,
    },
    body: JSON.stringify({
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
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Erreur API Mistral (${res.status}) ${errText}`.trim());
  }

  const json = await res.json();
  const answer = json?.choices?.[0]?.message?.content;
  if (!answer) {
    throw new Error('Réponse vide reçue de Mistral.');
  }

  return answer.trim();
}