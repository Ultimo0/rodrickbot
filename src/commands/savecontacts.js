import { isBotJid, normalizeJid } from '../utils/groupTarget.js';

function toVCard(jid, groupName) {
  const number = jid.split('@')[0];
  const displayName = `+${number}`;
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${displayName}`,
    `ORG:${groupName}`,
    `TEL;TYPE=CELL:${displayName}`,
    'END:VCARD',
  ].join('\n');
}

function sanitizeFileName(name) {
  return (name || 'groupe')
    .replace(/[\\/:*?"<>|]/g, '')
    .slice(0, 40)
    .trim() || 'groupe';
}

export default {
  name: 'savecontacts',
  aliases: ['exportcontacts', 'enregistrercontacts'],
  description:
    "Exporte les membres non‑administrateurs du groupe en fichier de contacts (.vcf), " +
    "envoyé uniquement en message privé (jamais dans le groupe). " +
    "Usage: {prefix}savecontacts",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    await ctx.processing();

    let metadata;
    try {
      metadata = await ctx.sock.groupMetadata(ctx.chatId);
    } catch (err) {
      await ctx.error(`❌ Impossible de lire les membres du groupe : ${err.message}`);
      return;
    }

    // Parcourir les participants
    const usable = [];
    let hidden = 0;
    let adminsExcluded = 0;

    for (const p of metadata.participants) {
      // 1) Exclure les administrateurs du groupe
      if (p.admin === 'admin' || p.admin === 'superadmin') {
        adminsExcluded += 1;
        continue;
      }

      // 2) Récupérer le JID téléphonique (peut être dans p.id, p.jid ou p.lid)
      const phoneJid = [p.id, p.jid, p.lid]
        .filter(Boolean)
        .map((j) => normalizeJid(j))
        .find((j) => j.endsWith('@s.whatsapp.net'));

      if (!phoneJid) {
        hidden += 1;
        continue;
      }

      // 3) Ne pas exporter le bot lui‑même (isBotJid compare contre TOUTES
      // ses identités connues, id ET lid — voir getBotSelfIds dans
      // groupTarget.js). Note : dans la pratique le bot est presque
      // toujours exclu plus tôt par le filtre admin ci-dessus quand il est
      // admin du groupe ; ce check reste utile quand il ne l'est pas.
      if (isBotJid(ctx.sock, phoneJid)) continue;

      usable.push(phoneJid);
    }

    if (!usable.length) {
      let msg = '❌ Aucun numéro exploitable trouvé.';
      if (adminsExcluded > 0 && usable.length === 0) {
        msg = '❌ Le groupe ne contient que des administrateurs – aucun contact à exporter.';
      } else if (hidden > 0) {
        msg += ' (certains membres masquent leur numéro).';
      }
      await ctx.error(msg);
      return;
    }

    const groupName = metadata.subject || 'Groupe WhatsApp';
    const vcf = usable.map((jid) => toVCard(jid, groupName)).join('\n');
    const buffer = Buffer.from(vcf, 'utf-8');

    // Envoyer le fichier en privé à l'utilisateur qui a lancé la commande
    const privateJid = normalizeJid(ctx.sender);
    const captionParts = [
      `📇 ${usable.length} contact(s) exporté(s) depuis *${groupName}*.`,
    ];
    if (adminsExcluded > 0) {
      captionParts.push(`👑 ${adminsExcluded} administrateur(s) exclu(s).`);
    }
    if (hidden > 0) {
      captionParts.push(`🔒 ${hidden} membre(s) ignoré(s) (numéro masqué par WhatsApp).`);
    }
    captionParts.push('Importe ce fichier dans ton application de contacts pour les enregistrer.');

    try {
      await ctx.sock.sendMessage(privateJid, {
        document: buffer,
        mimetype: 'text/vcard',
        fileName: `${sanitizeFileName(groupName)}.vcf`,
        caption: captionParts.join('\n'),
      });
    } catch (err) {
      await ctx.error(
        `❌ Impossible d'envoyer le fichier en privé : ${err.message}\n` +
          "Vérifie qu'une conversation privée avec le bot est possible pour ce compte."
      );
      return;
    }

    // ✅ Plus aucun message de confirmation dans le groupe.
    // La seule trace est le fichier reçu en privé.
  },
};