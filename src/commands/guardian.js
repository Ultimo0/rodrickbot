import { getGroupSettings, setGuardian, setGuardianSnapshot } from '../core/groupSettings.js';
import { captureGroupSnapshot, isBotGroupAdmin } from '../core/groupGuardian.js';

export default {
  name: 'guardian',
  description:
    "Protège le groupe contre les modifications non autorisées (nom, description, photo, lien " +
    "d'invitation, réglages) : restaure automatiquement l'état enregistré et avertit l'auteur. " +
    'Usage: {prefix}guardian on|off|status',
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'status') {
      const settings = getGroupSettings(ctx.chatId);
      if (!settings.guardian.enabled) {
        await ctx.reply({ text: '🛡 Guardian : désactivé ❌' });
        return;
      }
      const s = settings.guardian.snapshot;
      await ctx.reply({
        text: [
          '🛡 Guardian : activé ✅',
          '',
          `Nom de référence : ${s?.subject || '(vide)'}`,
          `Description de référence : ${s?.desc || '(vide)'}`,
          `Photo sauvegardée : ${s?.pictureFile ? 'oui' : 'non'}`,
          `Qui peut écrire : ${s?.announce ? 'admins uniquement' : 'tout le monde'}`,
          `Qui peut modifier les infos : ${s?.restrict ? 'admins uniquement' : 'tout le monde'}`,
          `Enregistré le : ${s?.capturedAt ? new Date(s.capturedAt).toLocaleString('fr-FR') : '?'}`,
        ].join('\n'),
      });
      return;
    }

    if (sub !== 'on' && sub !== 'off') {
      await ctx.error('Usage: !guardian on|off|status');
      return;
    }

    if (sub === 'off') {
      setGuardian(ctx.chatId, false);
      await ctx.success('❌ Guardian désactivé.');
      return;
    }

    // --- sub === 'on' ---
    await ctx.processing();

    if (!(await isBotGroupAdmin(ctx.sock, ctx.chatId))) {
      await ctx.error(
        "❌ Je dois être administrateur de ce groupe pour activer Guardian — sinon je ne peux rien restaurer."
      );
      return;
    }

    try {
      // Ordre important : on enregistre l'instantané AVANT d'activer, pour
      // que setGuardian(true) trouve un snapshot déjà en place.
      const snapshot = await captureGroupSnapshot(ctx.sock, ctx.chatId);
      setGuardianSnapshot(ctx.chatId, snapshot);
      setGuardian(ctx.chatId, true);
      await ctx.success(
        '✅ Guardian activé. État actuel du groupe sauvegardé comme référence (nom, description, photo, réglages).'
      );
    } catch (err) {
      await ctx.error(`❌ Impossible d'activer Guardian : ${err.message}`);
    }
  },
};
