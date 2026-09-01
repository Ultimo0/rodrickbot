import {
  setAntilink,
  setAntispam,
  setAntipromote,
  setAntistatut,
  setGuardian,
  setGuardianSnapshot,
} from '../core/groupSettings.js';
import { captureGroupSnapshot, isBotGroupAdmin } from '../core/groupGuardian.js';

// Délai entre deux activations. But: ne pas envoyer 5 confirmations d'un
// coup — même esprit que le délai entre groupes dans l'ancien summonListener
// ou entre les copies dans !pingall : ça reste lisible et ne ressemble pas
// à une rafale automatisée dans le fil de discussion.
const STEP_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  name: 'protectall',
  aliases: ['fullguard', 'securite'],
  description:
    'Active (ou désactive) en une seule commande les 5 protections de groupe : antilink, antispam, ' +
    "antipromote, antistatut et guardian — chacune avec un court délai entre les activations plutôt " +
    "que 5 confirmations d'un coup. Usage: {prefix}protectall on|off",
  category: 'Gestion de groupe',
  adminOnly: true,
  privateOnly: false,
  execute: async (ctx) => {
    if (!ctx.isGroup) {
      await ctx.error('Cette commande fonctionne uniquement dans un groupe.');
      return;
    }

    const sub = ctx.args[0]?.toLowerCase();
    if (sub !== 'on' && sub !== 'off') {
      await ctx.error('Usage: !protectall on|off');
      return;
    }

    const enable = sub === 'on';

    await ctx.processing();

    // Même exigence que !guardian on tout seul : sans droits admin, le bot
    // ne pourrait rien restaurer, donc autant prévenir avant de commencer
    // plutôt qu'à mi-chemin des 5 activations.
    if (enable && !(await isBotGroupAdmin(ctx.sock, ctx.chatId))) {
      await ctx.error(
        "❌ Je dois être administrateur de ce groupe pour tout activer — Guardian en particulier en a besoin pour pouvoir restaurer les changements."
      );
      return;
    }

    const icon = enable ? '✅' : '❌';
    const verb = enable ? 'activé' : 'désactivé';

    const steps = [
      { label: 'Antilink', apply: () => setAntilink(ctx.chatId, enable) },
      { label: 'Antispam', apply: () => setAntispam(ctx.chatId, enable) },
      { label: 'Antipromote', apply: () => setAntipromote(ctx.chatId, enable) },
      { label: 'Antistatut', apply: () => setAntistatut(ctx.chatId, enable) },
      {
        label: 'Guardian',
        apply: async () => {
          if (enable) {
            // Même ordre que commands/guardian.js : capturer l'instantané
            // AVANT d'activer, pour que setGuardian(true) le trouve déjà en place.
            const snapshot = await captureGroupSnapshot(ctx.sock, ctx.chatId);
            setGuardianSnapshot(ctx.chatId, snapshot);
          }
          setGuardian(ctx.chatId, enable);
        },
      },
    ];

    for (let i = 0; i < steps.length; i++) {
      const { label, apply } = steps[i];

      try {
        await apply();
        await ctx.reply({ text: `${icon} ${label} ${verb}.` });
      } catch (err) {
        // Une protection en échec ne doit pas bloquer les suivantes — on
        // informe et on continue (ex: guardian qui échoue à capturer
        // l'instantané ne doit pas empêcher antilink/antispam de s'activer).
        await ctx.reply({ text: `⚠️ ${label} : échec (${err.message}) — les autres protections continuent.` });
      }

      if (i < steps.length - 1) await sleep(STEP_DELAY_MS);
    }

    await ctx.success(
      `Protection complète ${verb} pour ce groupe (antilink, antispam, antipromote, antistatut, guardian).`
    );
  },
};