import 'dotenv/config';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAdmins, isAdmin as isAdminFromStore, runEnvMigration } from '../core/adminStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lecture "classique" (fs + JSON.parse) plutôt que la syntaxe récente
// `import settings.json with { type: 'json' }` : cette dernière casse le
// parseur utilisé par javascript-obfuscator (voir scripts/build.js).
// readFileSync fonctionne partout, obfusqué ou non.
const settings = JSON.parse(readFileSync(path.join(__dirname, 'settings.json'), 'utf-8'));

// Migration unique : si ADMIN_JIDS traîne encore dans le .env et
// qu'admins.json n'existe pas déjà, son contenu est importé une fois dans
// admins.json (voir core/adminStore.js). Sans effet si déjà migré.
runEnvMigration(process.env.ADMIN_JIDS);

/**
 * Configuration centralisée du bot.
 *
 * - src/config/settings.json : réglages non sensibles, versionnés dans git
 *   (nom du bot, préfixe, niveau de log, etc.)
 * - .env : informations sensibles uniquement (clés API, jetons, numéros
 *   de téléphone), jamais versionnées.
 * - admins.json : liste des admins du bot (propriétaire détecté en direct
 *   depuis la connexion + admins supplémentaires ajoutés via
 *   {prefix}addadmin) — voir core/adminStore.js. Ne vient plus de .env.
 *
 * Toute variable d'environnement doit être lue ICI et nulle part ailleurs,
 * afin de garder une seule source de vérité pour la configuration.
 */
export const config = {
  ...settings,

  authFolder: 'auth_info',

  // --- Secrets et données personnelles (depuis .env) ---
  phoneNumber: process.env.PHONE_NUMBER || '',

  // Calculé à chaque accès (propriétaire = JID en direct depuis le socket,
  // voir core/adminStore.js::setOwnerJid appelé dans core/client.js) plutôt
  // que figé une fois au démarrage — un getter reflète toujours l'état
  // courant, y compris juste après un {prefix}addadmin/{prefix}removeadmin.
  get adminJids() {
    return getAdmins();
  },

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

  // Si true, les logs sont AUSSI écrits dans data/logs/bot.log (en plus de
  // la sortie console habituelle), avec rotation automatique — voir
  // utils/logger.js. Désactivé par défaut : ne change rien au
  // comportement existant tant que ce n'est pas activé explicitement.
  logToFile: process.env.LOG_TO_FILE === 'true',
};

export function isAdmin(jid) {
  return isAdminFromStore(jid);
}