import { isAdmin } from '../config/index.js';
import { getGroupSettings } from '../core/groupSettings.js';
import { addWarn, resetWarns, WARN_LIMIT } from '../core/promotionGuardStore.js';
import { normalizeJid } from './groupTarget.js';
import { logger } from './logger.js';

/**
 * Intercepte les promotions admin effectuées nativement dans WhatsApp
 * (en dehors de !promote, qui est déjà réservé à ADMIN_JIDS — voir
 * commands/promote.js). Si !antipromote est actif dans ce groupe et que
 * l'auteur n'est pas un admin de confiance du bot (ADMIN_JIDS — qui fait
 * aussi office de "propriétaire du bot", voir core/instance.js) :
 *
 *   1. la promotion est annulée immédiatement (la/les cible(s) sont
 *      rétrogradées) ;
 *   2. l'auteur reçoit un avertissement, sur un compteur dédié
 *      (core/promotionGuardStore.js, séparé de !warn) ;
 *   3. au 3e avertissement, l'auteur lui-même perd son statut admin et le
 *      compteur est remis à zéro.
 *
 * @param {object} sock
 * @param {string} chatId
 * @param {string|undefined} author JID de la personne qui a effectué la promotion
 * @param {string[]} participants JIDs des personnes qui viennent d'être promues
 */
export async function handlePromoteGuard(sock, chatId, author, participants) {
  // Baileys ne fournit pas toujours `author` selon la version/le contexte :
  // sans lui, impossible de savoir qui a agi, donc on ne peut rien vérifier.
  if (!author || !participants?.length) return;

  const settings = getGroupSettings(chatId);
  if (!settings.antipromote.enabled) return;

  const normalizedAuthor = normalizeJid(author);
  const botJid = sock.user?.id ? normalizeJid(sock.user.id) : null;

  // La promotion vient du bot lui-même (ex: commande !promote, déjà
  // réservée à ADMIN_JIDS) : rien à faire.
  if (botJid && normalizedAuthor === botJid) return;

  // Auteur de confiance (ADMIN_JIDS == "propriétaire du bot") : autorisé.
  if (isAdmin(normalizedAuthor)) return;

  const authorNumber = normalizedAuthor.split('@')[0];

  // --- 1) Annule immédiatement la promotion ---
  try {
    await sock.groupParticipantsUpdate(chatId, participants, 'demote');
  } catch (err) {
    logger.warn({ err }, "Antipromote: impossible d'annuler la promotion");
  }

  // --- 2) Avertit l'auteur ---
  const count = addWarn(chatId, normalizedAuthor);

  if (count >= WARN_LIMIT) {
    resetWarns(chatId, normalizedAuthor);
    try {
      await sock.groupParticipantsUpdate(chatId, [normalizedAuthor], 'demote');
      await sock.sendMessage(chatId, {
        text:
          `🚫 @${authorNumber} a tenté de nommer un administrateur sans autorisation ` +
          `${WARN_LIMIT} fois : statut administrateur retiré.`,
        mentions: [normalizedAuthor],
      });
    } catch (err) {
      logger.warn({ err }, "Antipromote: impossible de rétrograder l'auteur");
      await sock.sendMessage(chatId, {
        text:
          `⚠️ @${authorNumber} a atteint ${WARN_LIMIT} avertissements, mais je n'ai pas pu ` +
          "le rétrograder (suis-je bien administrateur du groupe ?).",
        mentions: [normalizedAuthor],
      });
    }
    return;
  }

  await sock.sendMessage(chatId, {
    text:
      `🛡️ Promotion annulée : @${authorNumber} n'est pas autorisé à nommer un administrateur. ` +
      `Avertissement (${count}/${WARN_LIMIT}).`,
    mentions: [normalizedAuthor],
  });
}
