import { logger } from '../utils/logger.js';
import { isGroup } from '../utils/helpers.js';

/** Construit un JID WhatsApp à partir d'un numéro brut (ex: "33612345678"). */
function numberToJid(raw) {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

/**
 * Détermine le JID cible de la commande, par ordre de priorité :
 * 1. Utilisateur mentionné (@untel)
 * 2. Auteur du message cité (réponse à un message)
 * 3. Numéro passé en argument
 * 4. Par défaut : le groupe lui-même (en groupe) ou l'expéditeur (en privé)
 */
function resolveTargetJid(ctx) {
  const contextInfo = ctx.msg.message?.extendedTextMessage?.contextInfo;

  const mentioned = contextInfo?.mentionedJid?.[0];
  if (mentioned) return mentioned;

  const quotedParticipant = contextInfo?.participant;
  if (quotedParticipant) return quotedParticipant;

  if (ctx.args[0]) {
    const jid = numberToJid(ctx.args[0]);
    if (jid) return jid;
  }

  return ctx.isGroup ? ctx.chatId : ctx.sender;
}

export default {
  name: 'pp',
  aliases: ['photodeprofil', 'avatar'],
  description:
    'Affiche la photo de profil (mention, réponse à un message, numéro, ou par défaut soi-même/le groupe). Usage: !pp [@mention|numéro]',
  category: 'Média',
  adminOnly: false,
  privateOnly: false, // doit marcher en privé ET en groupe

  async execute(ctx) {
    const targetJid = resolveTargetJid(ctx);

    try {
      await ctx.processing();

      const url = await ctx.sock.profilePictureUrl(targetJid, 'image');

      const isTargetGroup = isGroup(targetJid);
      const label = isTargetGroup
        ? 'Photo de profil du groupe'
        : targetJid === ctx.sender
          ? 'Ta photo de profil'
          : `Photo de profil de @${targetJid.split('@')[0]}`;

      await ctx.sock.sendMessage(
        ctx.chatId,
        {
          image: { url },
          caption: `🖼️ *${label}*`,
          mentions: !isTargetGroup ? [targetJid] : undefined,
        },
        { quoted: ctx.msg }
      );

      await ctx.success();
    } catch (error) {
      logger.warn(`[pp] Impossible de récupérer la photo de profil: ${error.message}`);
      await ctx.error('❌ Aucune photo de profil trouvée (absente ou paramètres de confidentialité).');
    }
  },
};