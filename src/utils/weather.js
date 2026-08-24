// src/utils/weather.js
import { logger } from './logger.js';

const API_BASE = 'https://api.openweathermap.org/data/2.5';
const FORECAST_DAYS = 5;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Cache : { 'ville': { data, fetchedAt } }
const cache = new Map();

/**
 * Appelle l'API OpenWeatherMap avec gestion d'erreur, timeout et retry.
 */
async function fetchWeatherApi(endpoint, params) {
  const url = new URL(`${API_BASE}/${endpoint}`);
  url.search = new URLSearchParams(params).toString();

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutHandle);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const message = errorData.message || `HTTP ${res.status}`;
      throw new Error(message);
    }

    return res.json();
  } catch (err) {
    clearTimeout(timeoutHandle);
    if (err.name === 'AbortError') throw new Error('Délai de réponse dépassé.');
    throw err;
  }
}

/**
 * Récupère la météo actuelle et les prévisions pour une ville.
 */
export async function getWeather(city, apiKey) {
  if (!apiKey) throw new Error('Clé API OpenWeatherMap manquante.');

  const cacheKey = city.trim().toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    logger.debug(`Météo (cache) : ${city}`);
    return cached.data;
  }

  try {
    // 1. Météo actuelle
    const currentData = await fetchWeatherApi('weather', {
      q: city,
      appid: apiKey,
      units: 'metric',
      lang: 'fr',
    });

    // 2. Prévisions 5 jours (3h steps)
    const forecastData = await fetchWeatherApi('forecast', {
      q: city,
      appid: apiKey,
      units: 'metric',
      lang: 'fr',
    });

    // 3. Aggréger les prévisions par jour
    const dailyForecasts = aggregateForecast(forecastData.list, FORECAST_DAYS);

    const result = {
      city: currentData.name,
      country: currentData.sys.country,
      current: {
        temp: Math.round(currentData.main.temp),
        feelsLike: Math.round(currentData.main.feels_like),
        humidity: currentData.main.humidity,
        pressure: currentData.main.pressure,
        windSpeed: Math.round(currentData.wind.speed * 3.6), // m/s -> km/h
        windDeg: currentData.wind.deg,
        description: currentData.weather[0].description,
        icon: currentData.weather[0].icon,
        sunrise: new Date(currentData.sys.sunrise * 1000).toLocaleTimeString('fr-FR'),
        sunset: new Date(currentData.sys.sunset * 1000).toLocaleTimeString('fr-FR'),
      },
      forecast: dailyForecasts,
      fetchedAt: Date.now(),
    };

    // Mettre en cache
    cache.set(cacheKey, { data: result, fetchedAt: Date.now() });

    return result;
  } catch (err) {
    // En cas d'erreur, on supprime le cache pour cette ville (si périmé)
    cache.delete(cacheKey);
    throw err;
  }
}

/**
 * Agrège les prévisions 3h par jour (min/max, description dominante, icône).
 */
function aggregateForecast(list, days) {
  const grouped = {};

  for (const item of list) {
    const date = new Date(item.dt * 1000);
    const dayKey = date.toISOString().slice(0, 10); // YYYY-MM-DD

    if (!grouped[dayKey]) {
      grouped[dayKey] = {
        min: Infinity,
        max: -Infinity,
        descriptions: {},
        icons: {},
        humidity: [],
        wind: [],
      };
    }

    const g = grouped[dayKey];
    g.min = Math.min(g.min, item.main.temp_min);
    g.max = Math.max(g.max, item.main.temp_max);
    const desc = item.weather[0].description;
    g.descriptions[desc] = (g.descriptions[desc] || 0) + 1;
    const icon = item.weather[0].icon;
    g.icons[icon] = (g.icons[icon] || 0) + 1;
    g.humidity.push(item.main.humidity);
    g.wind.push(item.wind.speed);
  }

  const sortedKeys = Object.keys(grouped).sort().slice(0, days);
  return sortedKeys.map((dayKey) => {
    const g = grouped[dayKey];
    // Description la plus fréquente
    const topDesc = Object.entries(g.descriptions).sort((a, b) => b[1] - a[1])[0][0];
    // Icône la plus fréquente
    const topIcon = Object.entries(g.icons).sort((a, b) => b[1] - a[1])[0][0];
    const avgHumidity = Math.round(g.humidity.reduce((a, b) => a + b, 0) / g.humidity.length);
    const avgWind = Math.round(g.wind.reduce((a, b) => a + b, 0) / g.wind.length * 3.6);

    const date = new Date(dayKey);
    const weekdays = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    const weekday = weekdays[date.getDay()];
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const label = `${weekday} ${day}/${month}`;

    return {
      date: dayKey,
      label,
      min: Math.round(g.min),
      max: Math.round(g.max),
      description: topDesc,
      icon: topIcon,
      humidity: avgHumidity,
      windSpeed: avgWind,
    };
  });
}

/**
 * Formate la direction du vent en texte (N, NE, E, SE, S, SO, O, NO).
 */
export function windDirection(deg) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round(deg / 45) % 8;
  return directions[index];
}

/**
 * Nettoie le cache (pour les tests ou l'admin).
 */
export function clearWeatherCache() {
  cache.clear();
}