import 'dotenv/config';

/**
 * Configuration centralisée du bot.
 * Toute variable d'environnement doit être lue ICI et nulle part ailleurs,
 * afin de garder une seule source de vérité pour la configuration.
 */
export const config = {
  botName: process.env.BOT_NAME || 'MonBot',
  developerName: process.env.BOT_DEVELOPER || 'RodrickBOT Team',
  prefix: process.env.BOT_PREFIX || '!',
  logLevel: process.env.LOG_LEVEL || 'info',
  authMethod: (process.env.AUTH_METHOD || 'qr').toLowerCase(), // 'qr' | 'code'
  phoneNumber: process.env.PHONE_NUMBER || '',
  authFolder: 'auth_info',
  adminJids: (process.env.ADMIN_JIDS || '')
    .split(',')
    .map((jid) => jid.trim())
    .filter(Boolean),
  // Si true, le bot répond aussi aux messages envoyés depuis le compte
  // qui lui est connecté (utile en dev pour se tester soi-même en privé).
  // À laisser sur false en production.
  allowSelfTest: process.env.ALLOW_SELF_TEST === 'true',

  // Suivi centralisé (optionnel) — voir dashboard-server/. Laisser
  // TELEMETRY_URL vide désactive complètement la fonctionnalité.
  telemetryUrl: process.env.TELEMETRY_URL || '',
  telemetryApiKey: process.env.TELEMETRY_API_KEY || '',
  instanceId: process.env.INSTANCE_ID || '',
  instanceOwner: process.env.INSTANCE_OWNER || 'Inconnu',
};

export function isAdmin(jid) {
  return config.adminJids.includes(jid);
}