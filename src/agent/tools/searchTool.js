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

    // Timeout réseau : sans ça, un message reste bloqué indéfiniment si
    // DuckDuckGo ne répond jamais.
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), 8000);

    let res;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Erreur recherche : délai de réponse dépassé.');
      throw err;
    } finally {
      clearTimeout(timeoutHandle);
    }

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
