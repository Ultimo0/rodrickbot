import { isAdmin } from '../config/index.js';
import { getGroupSettings } from '../core/groupSettings.js';
import { addWarn, resetWarns, WARN_LIMIT } from '../core/promotionGuardStore.js';
import { normalizeJid } from './groupTarget.js';
import { logger } from './logger.js';

/**
 * Miroir exact d'antipromote.js, dans l'autre sens : au lieu de bloquer les
 * PROMOTIONS non-autorisées, bloque les RÉTROGRADATIONS visant un admin du
 * bot (isAdmin() — propriétaire + admins ajoutés via !addadmin). Empêche
 * qu'un admin du groupe démis l'un des admins du bot de ses fonctions.
 *
 * Compteur d'avertissement PARTAGÉ avec antipromote.js (même
 * core/promotionGuardStore.js) : peu importe laquelle des deux règles est
 * enfreinte, c'est le même comportement abusif de fond (toucher au statut
 * admin sans autorisation) — un seul compteur, pas deux à gérer séparément.
 *
 * @param {object} sock
 * @param {string} chatId
 * @param {string|undefined} author JID de la personne qui a effectué la rétrogradation
 * @param {string[]} participants JIDs des personnes qui viennent d'être rétrogradées
 */
export async function handleDemoteGuard(sock, chatId, author, participants) {
  if (!author || !participants?.length) return;

  const settings = getGroupSettings(chatId);
  if (!settings.antidemote.enabled) return;

  const normalizedAuthor = normalizeJid(author);
  const botJid = sock.user?.id ? normalizeJid(sock.user.id) : null;

  // La rétrogradation vient du bot lui-même (ex: !removeadmin ou toute
  // autre action légitime) : rien à faire.
  if (botJid && normalizedAuthor === botJid) return;

  // Auteur de confiance (admin du bot) : autorisé, même à rétrograder un
  // autre admin du bot si besoin (ex: conflit interne à régler entre eux).
  if (isAdmin(normalizedAuthor)) return;

  // Seuls les admins DU BOT sont protégés ici — un admin "classique" du
  // groupe qui n'a rien à voir avec le bot peut toujours être rétrogradé
  // normalement, ce n'est pas le rôle de cette protection.
  const protectedTargets = participants.filter((jid) => isAdmin(normalizeJid(jid)));
  if (!protectedTargets.length) return;

  const authorNumber = normalizedAuthor.split('@')[0];

  // --- 1) Repromotion immédiate des admins du bot visés ---
  try {
    await sock.groupParticipantsUpdate(chatId, protectedTargets, 'promote');
  } catch (err) {
    logger.warn({ err }, "Antidemote: impossible de repromouvoir l'admin visé");
  }

  // --- 2) Avertit l'auteur (compteur partagé avec antipromote) ---
  const count = addWarn(chatId, normalizedAuthor);

  if (count >= WARN_LIMIT) {
    resetWarns(chatId, normalizedAuthor);
    try {
      await sock.groupParticipantsUpdate(chatId, [normalizedAuthor], 'demote');
      await sock.sendMessage(chatId, {
        text:
          `🚫 @${authorNumber} a tenté de rétrograder un admin du bot sans autorisation ` +
          `${WARN_LIMIT} fois : statut administrateur retiré.`,
        mentions: [normalizedAuthor],
      });
    } catch (err) {
      logger.warn({ err }, "Antidemote: impossible de rétrograder l'auteur");
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
      `🛡️ Rétrogradation annulée : @${authorNumber} n'est pas autorisé à retirer le statut admin ` +
      `d'un admin du bot. Avertissement (${count}/${WARN_LIMIT}).`,
    mentions: [normalizedAuthor],
  });
}
