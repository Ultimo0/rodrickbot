const CHUNK_SIZE = 20; // même limite raisonnable que kickall/tagall par appel API

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

export default {
  name: 'approveall',
  aliases: ['approuvertout', 'acceptall'],
  description:
    "Approuve toutes les demandes d'adhésion en attente du groupe (mode approbation des membres activé).",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    let pending;
    try {
      // Liste des demandes d'adhésion en attente. Cette liste est
      // naturellement vide si le mode "Approbation des nouveaux membres"
      // n'est pas activé sur le groupe (ou si personne n'a demandé à
      // rejoindre) — inutile de vérifier un flag séparé, l'API répond
      // simplement par une liste vide dans ces deux cas.
      pending = await ctx.sock.groupRequestParticipantsList(ctx.chatId);
    } catch (err) {
      await ctx.error(`❌ Impossible de récupérer les demandes en attente : ${err.message}`);
      return;
    }

    if (!pending?.length) {
      await ctx.error(
        "❌ Aucune demande d'adhésion en attente (le mode approbation des membres est peut-être désactivé, ou personne n'attend actuellement)."
      );
      return;
    }

    const targets = pending.map((p) => p.jid);

    let approved = 0;
    let failed = 0;

    for (const batch of chunk(targets, CHUNK_SIZE)) {
      try {
        const result = await ctx.sock.groupRequestParticipantsUpdate(ctx.chatId, batch, 'approve');
        approved += result.filter((r) => r.status === '200').length;
        failed += result.filter((r) => r.status !== '200').length;
      } catch (err) {
        failed += batch.length;
      }
    }

    if (approved === 0) {
      await ctx.error(`❌ Aucune demande n'a pu être approuvée (${failed} échec(s)).`);
    } else if (failed) {
      await ctx.success(`⚠️ ${approved} demande(s) approuvée(s), ${failed} échec(s).`);
    } else {
      await ctx.success(`✅ ${approved} demande(s) d'adhésion approuvée(s).`);
    }
  },
};
