import { normalizeJid } from '../utils/groupTarget.js';
import { isBotGroupAdmin } from '../core/groupGuardian.js';
import { logger } from '../utils/logger.js';

const CHUNK_SIZE = 20; // même limite raisonnable que {prefix}kickall

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

export default {
  name: 'delgroup',
  aliases: ['supprimergroupe', 'deletegroup'],
  description:
    'Retire TOUS les membres du groupe (y compris les admins, contrairement à {prefix}kickall) puis fait quitter ' +
    "le bot. Irréversible. Important : WhatsApp ne permet à personne — bot ou humain — de supprimer un groupe " +
    "pour tout le monde ; le groupe reste techniquement vide et abandonné, pas effacé des serveurs WhatsApp. " +
    'Usage: {prefix}delgroup CONFIRMER',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    if (ctx.args[0] !== 'CONFIRMER') {
      await ctx.error(
        '⚠️ Action IRRÉVERSIBLE : tous les membres seront retirés (y compris les admins) et je quitterai le groupe.\n\n' +
          'Pour confirmer, tape exactement : {prefix}delgroup CONFIRMER'
      );
      return;
    }

    await ctx.processing();

    const groupJid = ctx.chatId;
    const senderJid = ctx.sender;

    // Notification de fin envoyée en PRIVÉ à celui qui a lancé la commande :
    // une fois le groupe quitté, le bot ne peut plus y écrire quoi que ce
    // soit pour confirmer que tout s'est bien passé.
    const notifySender = (text) => ctx.sock.sendMessage(senderJid, { text }).catch(() => {});

    try {
      const isAdmin = await isBotGroupAdmin(ctx.sock, groupJid);
      let removedCount = 0;

      if (isAdmin) {
        const metadata = await ctx.sock.groupMetadata(groupJid);
        const botJid = normalizeJid(ctx.sock.user?.id);
        const targets = metadata.participants.map((p) => normalizeJid(p.id)).filter((jid) => jid !== botJid);

        for (const batch of chunk(targets, CHUNK_SIZE)) {
          try {
            const result = await ctx.sock.groupParticipantsUpdate(groupJid, batch, 'remove');
            removedCount += result.filter((r) => r.status === '200').length;
          } catch (err) {
            logger.warn({ err }, "delgroup: échec du retrait d'un lot de membres");
          }
        }
      }

      const groupName = (await ctx.sock.groupMetadata(groupJid).catch(() => null))?.subject || groupJid;

      await ctx.sock.groupLeave(groupJid);

      if (isAdmin) {
        await notifySender(`✅ "${groupName}" : ${removedCount} membre(s) retiré(s), groupe quitté.`);
      } else {
        await notifySender(
          `⚠️ "${groupName}" : je ne suis pas admin, donc je n'ai pas pu retirer les membres — j'ai simplement quitté le groupe.`
        );
      }
    } catch (err) {
      logger.error({ err }, 'delgroup: échec');
      await notifySender(`❌ Échec de la suppression du groupe : ${err.message}`);
    }
  },
};
