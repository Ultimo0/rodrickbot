import 'dotenv/config';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lecture "classique" (fs + JSON.parse) plutôt que la syntaxe récente
// `import settings.json with { type: 'json' }` : cette dernière casse le
// parseur utilisé par javascript-obfuscator (voir scripts/build.js).
// readFileSync fonctionne partout, obfusqué ou non.
const settings = JSON.parse(readFileSync(path.join(__dirname, 'settings.json'), 'utf-8'));

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

  // JID de la chaîne WhatsApp officielle du bot (format xxxx@newsletter).
  // Utilisé pour marquer les messages menu/ping comme "Transféré depuis"
  // la chaîne (badge natif WhatsApp) — voir utils/channelCard.js.
  channelJid: process.env.CHANNEL_JID || '',
  // instanceId / instanceOwner ne viennent plus de .env : voir
  // core/instance.js — ils sont fournis une seule fois via !setup
  // directement dans WhatsApp, et tant qu'ils sont vides aucune autre
  // commande n'est exécutée (voir handlers/messageHandler.js).

  // Clé API Groq (https://console.groq.com/) — utilisée par la commande !ia
  // et toutes les fonctionnalités IA (correction, traduction, résumé, OCR,
  // Agent IA). Anciennement Mistral (MISTRAL_API_KEY), migré vers Groq.
  groqApiKey: process.env.GROQ_API_KEY || '',
};

export function isAdmin(jid) {
  return config.adminJids.includes(jid);
}