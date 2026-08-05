import { config } from '../config/index.js';
import { isInstanceConfigured, getInstance } from '../core/instance.js';
import { isLockdownMode } from '../core/state.js';
import { toScriptFont } from './fancyFont.js';
import { logger } from './logger.js';

const OWNER_SIGNATURE = 'Rodrigue Njaka';
const SEPARATOR = '┈'.repeat(22);

/** Construit le texte du message de démarrage envoyé en privé sur WhatsApp. */
export function buildStartupMessage(commandCount) {
  const botNameFancy = toScriptFont(config.botName);
  const signatureFancy = toScriptFont(OWNER_SIGNATURE);

  const lines = [
    '╭───────────────────╮',
    `   👾 ${botNameFancy}`,
    '╰───────────────────╯',
    '',
  ];

  if (isInstanceConfigured()) {
    const { instanceId, instanceOwner } = getInstance();
    lines.push('▸ *Statut*');
    lines.push('  ✅ Configurée');
    lines.push('');
    lines.push('▸ *Instance*');
    lines.push(`  ${instanceId}`);
    lines.push('');
    lines.push('▸ *Propriétaire*');
    lines.push(`  ${instanceOwner}`);
  } else {
    lines.push('▸ *Statut*');
    lines.push('  ⚠️ Non configurée');
    lines.push('');
    lines.push('▸ *À faire*');
    lines.push(`  ${config.prefix}setup <identifiant> <propriétaire>`);
  }

  lines.push('');
  lines.push('▸ *Commandes chargées*');
  lines.push(`  ${commandCount}`);
  lines.push('');
  lines.push('▸ *Mode*');
  lines.push(`  ${isLockdownMode() ? 'Privé' : 'Public'}`);
  lines.push(SEPARATOR);
  lines.push(`> ${signatureFancy}`);

  return lines.join('\n');
}

/**
 * Envoie le message de démarrage en privé, dans la conversation "Vous"
 * (message à soi-même sur le numéro du bot). Ne fait rien si PHONE_NUMBER
 * n'est pas défini dans .env.
 */
export async function sendStartupMessage(sock, commandCount) {
  if (!config.phoneNumber) {
    logger.debug('PHONE_NUMBER non défini, message de démarrage non envoyé.');
    return;
  }

  const selfJid = `${config.phoneNumber}@s.whatsapp.net`;

  try {
    await sock.sendMessage(selfJid, { text: buildStartupMessage(commandCount) });
  } catch (err) {
    logger.warn({ err }, "Impossible d'envoyer le message de démarrage en privé");
  }
}