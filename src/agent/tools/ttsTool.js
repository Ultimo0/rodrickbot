/**
 * Outil `tts`.
 *
 * Génère un speech audio à partir d’un texte via une API TTS publique.
 * L’outil retourne un buffer audio brut que l’Agent peut ensuite envoyer
 * dans WhatsApp, si le contexte le permet.
 */

export const ttsTool = {
  name: 'tts',
  description: 'Convertit un texte en synthèse vocale (TTS).',
  params: [
    { name: 'text', type: 'string', required: true, description: 'Texte à lire.' },
    { name: 'language', type: 'string', required: false, description: 'Langue, par défaut fr.' },
  ],
  execute: async ({ text, language = 'fr' }) => {
    if (!text?.trim()) throw new Error('Texte vide pour la synthèse vocale.');
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(language)}&client=tw-ob`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!res.ok) throw new Error(`Erreur TTS (${res.status}).`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  },
};
