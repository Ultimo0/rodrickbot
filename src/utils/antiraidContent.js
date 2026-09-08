import { isAdmin } from '../config/index.js';
import { getGroupSettings } from '../core/groupSettings.js';
import { addWarn, WARN_LIMIT } from '../core/warnStore.js';
import { isGroupAdmin } from './groupMetadataCache.js';
import { isGroup } from './helpers.js';
import { logger } from './logger.js';

/**
 * Détection par reconnaissance de motifs — pas d'exploitation de faille,
 * même logique qu'un filtre antispam classique : on repère des propriétés
 * objectivement associées à du contenu à risque (raccourcisseurs, APK,
 * formulations d'arnaque courantes), on ne "comprend" rien de plus.
 */

// Raccourcisseurs d'URL courants : masquent la vraie destination, donc un
// signal de risque même sans savoir où le lien mène réellement.
const SHORTENER_REGEX =
  /\b(bit\.ly|tinyurl\.com|is\.gd|t\.co|goo\.gl|ow\.ly|shorte\.st|cutt\.ly|rebrand\.ly|shorturl\.at|rb\.gy)\/\S+/i;

// Fichiers d'installation Android envoyés en lien direct — vecteur
// classique de faux logiciels.
const APK_LINK_REGEX = /https?:\/\/\S+\.apk\b/i;

// Formulations d'arnaque très courantes sur WhatsApp (gains/prêts/emploi
// avec contact à ajouter en privé). Volontairement large et français, pas
// une liste exhaustive — un filtre de première ligne, pas un détecteur
// parfait.
const SCAM_KEYWORDS_REGEX =
  /(f[ée]licitations?.{0,20}(gagn[ée]|s[ée]lectionn[ée])|pr[êe]t\s+(rapide|sans\s+garantie|en\s+24h)|investiss(ez|ement).{0,20}(bitcoin|crypto|forex)|offre\s+d'emploi.{0,20}(whatsapp|contactez)|virement.{0,10}gratuit|recharge.{0,10}gratuite)/i;

function detectReason(text) {
  if (SHORTENER_REGEX.test(text)) return 'lien raccourci (destination masquée)';
  if (APK_LINK_REGEX.test(text)) return 'lien vers un fichier .apk';
  if (SCAM_KEYWORDS_REGEX.test(text)) return "formulation typique d'arnaque";
  return null;
}

export async function handleAntiraidContent(sock, msg, chatId, sender, text) {
  if (!isGroup(chatId) || !text) return false;

  const settings = getGroupSettings(chatId);
  if (!settings.antiraid.enabled) return false;

  const reason = detectReason(text);
  if (!reason) return false;

  if (isAdmin(sender)) return false;

  try {
    if (await isGroupAdmin(sock, chatId, sender)) return false;
  } catch (err) {
    logger.warn({ err }, 'Impossible de vérifier le statut admin pour antiraid');
    return false;
  }

  try {
    await sock.sendMessage(chatId, { delete: msg.key });
  } catch (err) {
    logger.warn({ err }, "Antiraid: impossible de supprimer le message (le bot est-il admin ?)");
  }

  const number = sender.split('@')[0].split(':')[0];
  const count = addWarn(chatId, sender);

  if (count >= WARN_LIMIT) {
    try {
      await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
      await sock.sendMessage(chatId, {
        text: `> 🚨 @${number} a posté du contenu à risque (${reason}) et atteint ${WARN_LIMIT} avertissements : expulsion.`,
        mentions: [sender],
      });
    } catch (err) {
      logger.warn({ err }, 'Antiraid: expulsion impossible');
    }
  } else {
    await sock.sendMessage(chatId, {
      text: `> 🚨 Message supprimé (${reason}). @${number} averti (${count}/${WARN_LIMIT}).`,
      mentions: [sender],
    });
  }

  return true;
}
