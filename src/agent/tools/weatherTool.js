/**
 * Outil `weather`.
 *
 * Adaptateur léger autour d’une API météo publique. Le code réutilise la
 * même convention que les autres outils du sous-système Agent :
 * `name`, `description`, `params`, `execute()`.
 */

const WEATHER_API_URL = 'https://wttr.in';

export const weatherTool = {
  name: 'weather',
  description: 'Récupère la météo d’une ville donnée via une API publique.',
  params: [
    { name: 'city', type: 'string', required: true, description: 'Nom de la ville ou code postal.' },
    { name: 'lang', type: 'string', required: false, description: 'Langue de retour (fr par défaut).' },
  ],
  execute: async ({ city, lang = 'fr' }) => {
    if (!city?.trim()) throw new Error('Ville manquante pour la météo.');
    const url = `${WEATHER_API_URL}/${encodeURIComponent(city)}?format=j1&lang=${encodeURIComponent(lang)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erreur météo (${res.status}).`);
    const json = await res.json();
    const current = json?.current_condition?.[0];
    if (!current) throw new Error('Aucune météo trouvée pour cette localisation.');

    return {
      city,
      condition: current.weatherDesc?.[0]?.value || 'inconnu',
      tempC: current.temp_C,
      feelsLikeC: current.FeelsLikeC,
      humidity: current.humidity,
      windKph: current.windspeedKmph,
    };
  },
};
