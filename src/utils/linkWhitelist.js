import { isAdmin } from '../config/index.js';
import { getGroupSettings } from '../core/groupSettings.js';
import { addWarn, WARN_LIMIT } from '../core/warnStore.js';
import { isGroupAdmin } from './groupMetadataCache.js';
import { isGroup } from './helpers.js';
import { logger } from './logger.js';

const LINK_REGEX = /(https?:\/\/|www\.)\S+|chat\.whatsapp\.com\/\S+/i;

/** Extrait le nom d'hôte (domaine) d'un lien trouvé dans un texte, ou null. */
export function extractDomain(text) {
  const match = text?.match(LINK_REGEX);
  if (!match) return null;

  let raw = match[0];
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Contrairement à !antilink (qui bloque TOUS les liens sauf ceux des
 * admins), cette fonctionnalité bloque uniquement les liens dont le
 * domaine n'est PAS dans la liste blanche configurée par
 * {prefix}antilien-domaine add <domaine>. Les deux protections sont
 * indépendantes et peuvent être actives en même temps sur un même groupe
 * (voir handlers/messageHandler.js) — chacune gérée par son propre
 * réglage (`antilink` / `linkWhitelist`) dans core/groupSettings.js.
 */
export async function handleLinkWhitelist(sock, msg, chatId, sender, text) {
  if (!isGroup(chatId) || !text || !LINK_REGEX.test(text)) return false;

  const settings = getGroupSettings(chatId);
  if (!settings.linkWhitelist.enabled) return false;

  const domain = extractDomain(text);
  if (!domain) return false;

  const whitelist = settings.linkWhitelist.domains || [];
  if (whitelist.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`))) {
    return false; // domaine autorisé
  }

  if (isAdmin(sender)) return false;

  try {
    if (await isGroupAdmin(sock, chatId, sender)) return false;
  } catch (err) {
    logger.warn({ err }, 'Impossible de vérifier le statut admin pour antilien-domaine');
    return false;
  }

  try {
    await sock.sendMessage(chatId, { delete: msg.key });
  } catch (err) {
    logger.warn({ err }, "Antilien-domaine: impossible de supprimer le message (le bot est-il admin ?)");
  }

  const number = sender.split('@')[0].split(':')[0];
  const count = addWarn(chatId, sender);

  if (count >= WARN_LIMIT) {
    try {
      await sock.groupParticipantsUpdate(chatId, [sender], 'remove');
      await sock.sendMessage(chatId, {
        text: `> 🚫 @${number} a posté un lien vers un domaine non autorisé (${domain}) et atteint ${WARN_LIMIT} avertissements : expulsion.`,
        mentions: [sender],
      });
    } catch (err) {
      logger.warn({ err }, 'Antilien-domaine: expulsion impossible');
    }
  } else {
    await sock.sendMessage(chatId, {
      text: `> 🔗 Lien supprimé (domaine non autorisé : ${domain}). @${number} averti (${count}/${WARN_LIMIT}).`,
      mentions: [sender],
    });
  }

  return true;
}
