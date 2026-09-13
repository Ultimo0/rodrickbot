// src/commands/meteo.js
import { config } from '../config/index.js';
import { getWeather, windDirection } from '../utils/weather.js';
import { logger } from '../utils/logger.js';

// Lue en direct sur `config` à chaque exécution (pas de const figée au
// chargement du module) : voir setApiKey()/CONFIGURABLE_API_KEYS dans
// config/index.js — !meteoapi doit prendre effet sans redémarrage du bot.

// Emojis météo (mapping icônes OpenWeatherMap -> emojis)
const WEATHER_ICONS = {
  '01d': '☀️', '01n': '🌙',
  '02d': '⛅', '02n': '☁️',
  '03d': '☁️', '03n': '☁️',
  '04d': '☁️', '04n': '☁️',
  '09d': '🌧️', '09n': '🌧️',
  '10d': '🌦️', '10n': '🌧️',
  '11d': '⛈️', '11n': '⛈️',
  '13d': '❄️', '13n': '❄️',
  '50d': '🌫️', '50n': '🌫️',
};

function getEmoji(icon) {
  return WEATHER_ICONS[icon] || '🌡️';
}

function renderMeteo(data) {
  const { city, country, current, forecast } = data;
  const lines = [];

  // En-tête
  lines.push(`🌤️ *Météo à ${city} (${country})*`);
  lines.push('');

  // Météo actuelle
  lines.push(`*Actuellement :*`);
  lines.push(`${getEmoji(current.icon)} ${current.description}`);
  lines.push(`🌡️ *${current.temp}°C* (ressenti ${current.feelsLike}°C)`);
  lines.push(`💧 Humidité : ${current.humidity}%`);
  lines.push(`💨 Vent : ${current.windSpeed} km/h ${windDirection(current.windDeg)}`);
  lines.push(`📊 Pression : ${current.pressure} hPa`);
  lines.push(`🌅 Lever : ${current.sunrise} · 🌇 Coucher : ${current.sunset}`);
  lines.push('');

  // Prévisions
  lines.push(`*📅 Prévisions ${forecast.length} jours :*`);
  lines.push('');
  for (const day of forecast) {
    const emoji = getEmoji(day.icon);
    lines.push(`${emoji} *${day.label}* — ${day.min}°C / ${day.max}°C`);
    lines.push(`   ${day.description} · 💧 ${day.humidity}% · 💨 ${day.windSpeed} km/h`);
  }

  lines.push('');
  lines.push(`_Données : OpenWeatherMap · ${new Date(data.fetchedAt).toLocaleString('fr-FR')}_`);

  return lines.join('\n');
}

export default {
  name: 'meteo',
  aliases: ['weather', 'météo'],
  description:
    'Affiche la météo actuelle et les prévisions 5 jours pour une ville. ' +
    'Usage : {prefix}meteo <ville>  (ex: {prefix}meteo Douala, {prefix}meteo Paris,FR)',
  category: 'Utilitaires',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    if (!config.openWeatherApiKey) {
      await ctx.error('❌ La clé API OpenWeatherMap n\'est pas configurée. Contacte le développeur.');
      return;
    }

    const city = ctx.args.join(' ');
    if (!city) {
      await ctx.error(
        '❌ Indique une ville.\n' +
        'Exemples : /meteo Douala\n' +
        '           /meteo Paris,FR\n' +
        '           /meteo 75001,fr'
      );
      return;
    }

    await ctx.processing();

    try {
      const data = await getWeather(city, config.openWeatherApiKey);
      const text = renderMeteo(data);
      await ctx.sock.sendMessage(ctx.chatId, { text }, { quoted: ctx.msg });
      await ctx.success();
    } catch (err) {
      logger.warn({ err, city }, 'Erreur météo');
      let msg = `❌ Impossible de récupérer la météo pour "${city}".`;

      if (err.message.includes('city not found')) {
        msg = `❌ Ville "${city}" introuvable. Vérifie l'orthographe ou ajoute le pays (ex: Paris,FR).`;
      } else if (err.message.includes('Invalid API key')) {
        msg = '❌ Clé API OpenWeatherMap invalide. Contacte le développeur.';
      } else if (err.message.includes('Délai de réponse')) {
        msg = '❌ Délai de réponse dépassé. Réessaie dans quelques instants.';
      }

      await ctx.error(msg);
    }
  },
};