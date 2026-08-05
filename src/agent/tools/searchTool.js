/**
 * Outil `search`.
 *
 * Outil de recherche textuelle simple, basé sur l’API publique DuckDuckGo
 * HTML instant. L’objectif est de rester léger et réutilisable.
 */

export const searchTool = {
  name: 'search',
  description: 'Recherche un texte sur le web à l’aide de DuckDuckGo.',
  params: [
    { name: 'query', type: 'string', required: true, description: 'Terme ou question à rechercher.' },
    { name: 'limit', type: 'number', required: false, description: 'Nombre de résultats à retourner.' },
  ],
  execute: async ({ query, limit = 3 }) => {
    if (!query?.trim()) throw new Error('Requête de recherche vide.');
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!res.ok) throw new Error(`Erreur recherche (${res.status}).`);
    const html = await res.text();

    const matched = [...html.matchAll(/uddg=([^&]+)&/g)]
      .map((m) => decodeURIComponent(m[1]))
      .filter(Boolean);

    const unique = [...new Set(matched)].slice(0, Number(limit) || 3);
    if (!unique.length) throw new Error('Aucune réponse récupérée par la recherche.');
    return unique;
  },
};
