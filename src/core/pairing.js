import { createInterface } from 'readline/promises';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Demande le numéro de téléphone à l'utilisateur dans le terminal
 * si aucun PHONE_NUMBER n'est défini dans .env.
 * Format attendu: indicatif pays + numéro, sans "+" ni espaces (ex: 261340000000)
 */
async function askPhoneNumber() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    'Entrez votre numéro WhatsApp (format international, sans "+", ex: 261340000000): '
  );
  rl.close();
  return answer.trim();
}

/** Ne garde que les chiffres (retire "+", espaces, tirets...) */
function sanitizePhoneNumber(raw) {
  return raw.replace(/[^0-9]/g, '');
}

/**
 * Gère l'obtention et l'affichage du pairing code pour se connecter
 * sans QR code. Ne fait rien si le compte est déjà enregistré ou si
 * la méthode d'authentification configurée n'est pas "code".
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {boolean} alreadyRegistered - state.creds.registered
 */
export async function handlePairingCode(sock, alreadyRegistered) {
  if (config.authMethod !== 'code' || alreadyRegistered) return;

  let phoneNumber = sanitizePhoneNumber(config.phoneNumber);

  if (!phoneNumber) {
    phoneNumber = sanitizePhoneNumber(await askPhoneNumber());
  }

  if (!phoneNumber || phoneNumber.length < 8) {
    logger.error(
      'Numéro invalide. Renseignez PHONE_NUMBER dans .env ou saisissez un numéro valide.'
    );
    return;
  }

  try {
    // Laisse le socket s'initialiser avant de demander le code
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const code = await sock.requestPairingCode(phoneNumber);
    const formatted = code.match(/.{1,4}/g)?.join('-') || code;

    logger.info('='.repeat(40));
    logger.info(`Code de jumelage : ${formatted}`);
    logger.info('Sur votre téléphone: Réglages > Appareils connectés');
    logger.info('> Connecter un appareil > Se connecter avec un numéro');
    logger.info('='.repeat(40));
  } catch (err) {
    logger.error({ err }, 'Impossible de générer le pairing code');
  }
}
