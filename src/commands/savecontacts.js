import { normalizeJid } from '../utils/groupTarget.js';

function toVCard(jid, groupName) {
  const number = jid.split('@')[0];
  const displayName = `+${number}`;
  return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${displayName}`, `ORG:${groupName}`, `TEL;TYPE=CELL:${displayName}`, 'END:VCARD'].join(
    '\n'
  );
}

function sanitizeFileName(name) {
  return (name || 'groupe').replace(/[\\/:*?"<>|]/g, '').slice(0, 40).trim() || 'groupe';
}

export default {
  name: 'savecontacts',
  aliases: ['exportcontacts', 'enregistrercontacts'],
  description:
    "Exporte les membres du groupe en fichier de contacts (.vcf), envoyé uniquement en message privé (jamais dans le groupe). Usage: {prefix}savecontacts",
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

    const botJid = normalizeJid(ctx.sock.user?.id);

    // Depuis une mise à jour de confidentialité WhatsApp (2024+), Baileys
    // retourne les participants d'un groupe avec un identifiant interne
    // (@lid) dans p.id au lieu du vrai numéro (@s.whatsapp.net).
    // Le vrai numéro peut se trouver dans p.id, p.jid OU p.lid selon la
    // version de WhatsApp/Baileys — même stratégie que groupGuardian.js
    // (voir isBotGroupAdmin) qui inspecte les trois champs.
    const usable = [];
    let hidden = 0;
    for (const p of metadata.participants) {
      // On cherche le premier champ qui contient un JID téléphonique classique.
      const phoneJid = [p.id, p.jid, p.lid]
        .filter(Boolean)
        .map((j) => normalizeJid(j))
        .find((j) => j.endsWith('@s.whatsapp.net'));

      if (!phoneJid) { hidden += 1; continue; }
      if (phoneJid === botJid) continue;
      usable.push(phoneJid);
    }

    if (!usable.length) {
      await ctx.error('❌ Aucun numéro exploitable trouvé (les membres masquent peut-être tous leur numéro).');
      return;
    }

    const groupName = metadata.subject || 'Groupe WhatsApp';
    const vcf = usable.map((jid) => toVCard(jid, groupName)).join('\n');
    const buffer = Buffer.from(vcf, 'utf-8');

    // Toujours envoyé en privé (chat direct avec la personne qui exécute la
    // commande), jamais dans le groupe — pour ne pas exposer la liste
    // complète des numéros à tous les membres.
    const privateJid = normalizeJid(ctx.sender);

    try {
      await ctx.sock.sendMessage(privateJid, {
        document: buffer,
        mimetype: 'text/vcard',
        fileName: `${sanitizeFileName(groupName)}.vcf`,
        caption:
          `📇 ${usable.length} contact(s) exporté(s) depuis *${groupName}*.\n` +
          (hidden ? `${hidden} membre(s) ignoré(s) (numéro masqué par WhatsApp).\n` : '') +
          'Importe ce fichier dans ton application de contacts pour les enregistrer.',
      });
    } catch (err) {
      await ctx.error(
        `❌ Impossible d'envoyer le fichier en privé : ${err.message}\n` +
          "Vérifie qu'une conversation privée avec le bot est possible pour ce compte."
      );
      return;
    }

    // Dans le groupe : confirmation neutre seulement, aucun détail ni numéro.
    await ctx.success('✅ Liste des membres envoyée en message privé.');
  },
};
