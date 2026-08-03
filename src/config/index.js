import 'dotenv/config';
import settings from './settings.json' with { type: 'json' };

/**
 * Configuration centralisée du bot.
 *
 * - src/config/settings.json : réglages non sensibles, versionnés dans git
 *   (nom du bot, préfixe, niveau de log, etc.)
 * - .env : informations sensibles uniquement (clés API, jetons, numéros
 *   de téléphone, identifiants admin), jamais versionnées.
 *
 * Toute variable d'environnement doit être lue ICI et nulle part ailleurs,
 * afin de garder une seule source de vérité pour la configuration.
 */
export const config = {
  ...settings,

  authFolder: 'auth_info',

  // --- Secrets et données personnelles (depuis .env) ---
  phoneNumber: process.env.PHONE_NUMBER || '',
  adminJids: (process.env.ADMIN_JIDS || '')
    .split(',')
    .map((jid) => jid.trim())
    .filter(Boolean),

  telemetryUrl: process.env.TELEMETRY_URL || '',
  telemetryApiKey: process.env.TELEMETRY_API_KEY || '',
  // instanceId / instanceOwner ne viennent plus de .env : voir
  // core/instance.js — ils sont fournis une seule fois via !setup
  // directement dans WhatsApp, et tant qu'ils sont vides aucune autre
  // commande n'est exécutée (voir handlers/messageHandler.js).

  // Clé API Mistral (https://console.mistral.ai/) — utilisée par la commande !ia
  mistralApiKey: process.env.MISTRAL_API_KEY || '',
};

export function isAdmin(jid) {
  return config.adminJids.includes(jid);
}