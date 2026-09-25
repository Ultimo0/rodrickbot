import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAdmins, isAdmin as isAdminFromStore, runEnvMigration } from '../core/adminStore.js';
import { atomicWriteFileSync } from '../utils/atomicWrite.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.join(__dirname, 'settings.json');
const SETTINGS_EXAMPLE_PATH = path.join(__dirname, 'settings.example.json');

// Amorçage : si settings.json n'existe pas encore (ex: fichier volontairement
// gitignoré une fois configuré — voir .gitignore et la note en bas de ce
// fichier), on le crée à partir du modèle versionné settings.example.json
// (mêmes réglages, toutes les clés vides) plutôt que de planter au
// démarrage.
if (!existsSync(SETTINGS_PATH) && existsSync(SETTINGS_EXAMPLE_PATH)) {
  atomicWriteFileSync(SETTINGS_PATH, readFileSync(SETTINGS_EXAMPLE_PATH));
  console.warn('[config] settings.json absent, créé à partir de settings.example.json.');
}

// Lecture "classique" (fs + JSON.parse) plutôt que la syntaxe récente
// `import settings.json with { type: 'json' }` : cette dernière casse le
// parseur utilisé par javascript-obfuscator (voir scripts/build.js).
// readFileSync fonctionne partout, obfusqué ou non.
//
// `settings` reste la copie "fichier" de référence : toute modification
// d'une clé API (voir setApiKey/deleteApiKey plus bas) met à jour CET
// objet, qui est ensuite sérialisé tel quel dans settings.json — jamais
// `config` directement, qui contient aussi des champs calculés
// (adminJids, phoneNumber, authFolder...) qui n'ont rien à faire dans le
// fichier.
const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8'));

// Migration unique : si ADMIN_JIDS traîne encore dans le .env et
// qu'admins.json n'existe pas déjà, son contenu est importé une fois dans
// admins.json (voir core/adminStore.js). Sans effet si déjà migré.
runEnvMigration(process.env.ADMIN_JIDS);

/**
 * Migration unique des anciennes clés .env vers settings.json, pour ne pas
 * faire perdre leur configuration aux installations existantes qui
 * mettent à jour le bot. Ne s'exécute QUE si le champ est encore vide dans
 * settings.json (donc jamais après une première configuration via
 * WhatsApp ou une édition manuelle) — une fois migré, la variable .env
 * correspondante peut être supprimée, elle ne sera plus lue.
 */
function migrateEnvKeyIfNeeded(settingsField, envVarName) {
  if (settings[settingsField]) return false; // déjà configuré dans settings.json, on ne touche à rien
  const legacyValue = process.env[envVarName];
  if (!legacyValue) return false;

  settings[settingsField] = legacyValue;
  console.warn(
    `[config] Migration : ${envVarName} importé depuis .env vers settings.json (champ "${settingsField}"). ` +
      `Tu peux maintenant retirer ${envVarName} de ton .env — il ne sera plus lu une fois cette migration faite.`
  );
  return true;
}

const migrated = [
  migrateEnvKeyIfNeeded('groqApiKey', 'GROQ_API_KEY'),
  migrateEnvKeyIfNeeded('removeBgApiKey', 'REMOVE_BG_API_KEY'),
  migrateEnvKeyIfNeeded('openWeatherApiKey', 'OPENWEATHER_API_KEY'),
  migrateEnvKeyIfNeeded('telemetryUrl', 'TELEMETRY_URL'),
  migrateEnvKeyIfNeeded('telemetryApiKey', 'TELEMETRY_API_KEY'),
  migrateEnvKeyIfNeeded('channelJid', 'CHANNEL_JID'),
].some(Boolean);

// On ne réécrit settings.json que si une migration a réellement eu lieu —
// pas à chaque démarrage, pour ne pas toucher inutilement le fichier (et
// son mtime) quand rien n'a changé.
if (migrated) {
  atomicWriteFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
}

/**
 * Configuration centralisée du bot.
 *
 * - src/config/settings.json : réglages du bot ET clés API/secrets
 *   d'infrastructure. N'est PLUS considéré comme un fichier "sans secret" :
 *   une fois les clés renseignées (via WhatsApp ou à la main), il ne doit
 *   PLUS être versionné — voir .gitignore. Le modèle versionné est
 *   settings.example.json (mêmes champs, valeurs vides).
 * - .env : seulement ce qui ne peut PAS venir de settings.json car
 *   nécessaire avant même la connexion WhatsApp (PHONE_NUMBER pour
 *   l'appairage par code), ou qui n'est pas un secret (LOG_TO_FILE).
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

  // --- Ce qui reste dans .env (voir commentaire ci-dessus) ---
  phoneNumber: process.env.PHONE_NUMBER || '',

  // Calculé à chaque accès (propriétaire = JID en direct depuis le socket,
  // voir core/adminStore.js::setOwnerJid appelé dans core/client.js) plutôt
  // que figé une fois au démarrage — un getter reflète toujours l'état
  // courant, y compris juste après un {prefix}addadmin/{prefix}removeadmin.
  get adminJids() {
    return getAdmins();
  },

  // instanceId / instanceOwner ne viennent plus de .env : voir
  // core/instance.js — ils sont fournis une seule fois via !setup
  // directement dans WhatsApp, et tant qu'ils sont vides aucune autre
  // commande n'est exécutée (voir handlers/messageHandler.js).

  // Si true, les logs sont AUSSI écrits dans data/logs/bot.log (en plus de
  // la sortie console habituelle), avec rotation automatique — voir
  // utils/logger.js. Désactivé par défaut : ne change rien au
  // comportement existant tant que ce n'est pas activé explicitement.
  logToFile: process.env.LOG_TO_FILE === 'true',

  // EXPÉRIMENTAL — voir utils/interactiveMenu.js pour le détail complet.
  // Envoie !menu sous forme de vraie liste WhatsApp cliquable (listMessage
  // + nœud binaire <biz><list>) au lieu du texte classique. Ce n'est PAS
  // un format officiellement supporté par Baileys : ça repose sur un nœud
  // XML injecté manuellement, non garanti stable d'une mise à jour
  // WhatsApp à l'autre, et le rendu (vraie liste vs texte brut en repli)
  // peut varier selon le client. Désactivé par défaut. Si activé et que
  // le rendu casse ou semble instable, repasse à false sans hésiter — le
  // menu texte reste le comportement de référence, pas un dégradé.
  experimentalInteractiveMenu: process.env.EXPERIMENTAL_INTERACTIVE_MENU === 'true',
};

export function isAdmin(jid) {
  return isAdminFromStore(jid);
}

/**
 * Clés API modifiables depuis WhatsApp (!groqapi, !removeapi, !meteoapi —
 * voir utils/apiKeyCommand.js). Volontairement une liste blanche explicite :
 * telemetryUrl/telemetryApiKey/channelJid ne sont PAS dedans, comme demandé
 * — ces trois-là ne se modifient qu'en éditant settings.json directement.
 */
export const CONFIGURABLE_API_KEYS = [
  { field: 'groqApiKey', label: 'Groq (IA)', command: 'groqapi' },
  { field: 'removeBgApiKey', label: 'Remove.bg', command: 'removeapi' },
  { field: 'openWeatherApiKey', label: 'OpenWeather (météo)', command: 'meteoapi' },
];

function persistSettings() {
  atomicWriteFileSync(SETTINGS_PATH, `${JSON.stringify(settings, null, 2)}\n`);
}

/**
 * Définit une clé API configurable et la persiste immédiatement dans
 * settings.json. Met à jour `config` ET `settings` (voir commentaire sur
 * `settings` plus haut) : `config` est l'objet importé partout ailleurs
 * dans le code (groq.js, removebg.js, meteo.js...) et lu à chaque appel
 * (jamais destructuré tôt), donc cette mutation prend effet immédiatement,
 * sans redémarrage du bot.
 * @throws si `field` n'est pas dans CONFIGURABLE_API_KEYS (garde-fou :
 *   empêche par exemple qu'une commande WhatsApp modifie telemetryApiKey).
 */
export function setApiKey(field, value) {
  if (!CONFIGURABLE_API_KEYS.some((k) => k.field === field)) {
    throw new Error(`Clé non configurable depuis WhatsApp : ${field}`);
  }
  settings[field] = value;
  config[field] = value;
  persistSettings();
}

/** Supprime une clé API configurable (équivalent à setApiKey(field, '')). */
export function deleteApiKey(field) {
  setApiKey(field, '');
}

/**
 * Statut de chaque clé (configurable ou non) pour affichage dans le
 * message de démarrage — voir utils/startupMessage.js et
 * themes/*.js::renderStartup.
 */
export function getApiKeyStatuses() {
  return [
    ...CONFIGURABLE_API_KEYS.map((k) => ({ label: k.label, configured: Boolean(config[k.field]) })),
    { label: 'Télémétrie', configured: Boolean(config.telemetryUrl && config.telemetryApiKey) },
    { label: 'Chaîne WhatsApp', configured: Boolean(config.channelJid) },
  ];
}
