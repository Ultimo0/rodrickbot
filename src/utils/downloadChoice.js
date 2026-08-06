/**
 * Enregistre un choix de téléchargement en attente (audio/vidéo) et envoie
 * le menu de format standard. Factorise la logique commune aux commandes
 * !youtube et !tiktok : même délai, même message d'expiration, même menu.
 */
import { setPendingChoice } from '../core/downloadSessions.js';

const CHOICE_TIMEOUT_MS = 30 * 1000;

/**
 * @param {object} ctx     contexte de commande
 * @param {object} pending payload stocké pour le suivi (type + métadonnées)
 * @param {object} [opts]
 * @param {string} [opts.title] titre du média, affiché en gras au-dessus du menu
 */
export function promptDownloadChoice(ctx, pending, { title } = {}) {
  setPendingChoice(ctx.chatId, ctx.sender, pending, CHOICE_TIMEOUT_MS, async () => {
    try {
      await ctx.replyRaw({ text: '> ⌛ Délai expiré, demande annulée.' });
    } catch {
      // le chat n'existe peut-être plus, on ignore
    }
  });

  const header = title ? `🎬 *${title}*\n\n` : '🎬 ';

  return ctx.reply({
    text:
      header +
      'Quel format voulez-vous télécharger ?\n\n' +
      '1️⃣ Audio (MP3)\n' +
      '2️⃣ Vidéo (MP4)\n\n' +
      'Répondez avec 1 ou 2 (délai: 30 secondes)',
  });
}
