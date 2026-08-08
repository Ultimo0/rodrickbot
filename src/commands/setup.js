import { isInstanceConfigured, setInstance } from '../core/instance.js';
import { startTelemetry } from '../core/telemetry.js';

export default {
  name: 'setup',
  description: "Configure cette instance du bot (obligatoire, une seule fois). Usage: {prefix}setup <identifiant> <propriétaire>",
  category: 'Utilitaires',
  // Cette commande doit rester accessible même avant toute configuration
  // et même en groupe: elle est délibérément exemptée du filtre
  // "instance non configurée" dans handlers/messageHandler.js.
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    if (isInstanceConfigured()) {
      await ctx.error('Cette instance est déjà configurée. !setup ne peut être utilisé qu\'une seule fois.');
      return;
    }

    const [instanceId, ...ownerParts] = ctx.args;
    const instanceOwner = ownerParts.join(' ').trim();

    if (!instanceId || !instanceOwner) {
      await ctx.error(
        'Usage: !setup <identifiant> <propriétaire>\n' +
        'Exemple: !setup boutique-jean Jean Dupont'
      );
      return;
    }

    setInstance(instanceId, instanceOwner);
    startTelemetry();

    await ctx.success(
      `Instance configurée avec succès !\nIdentifiant: ${instanceId}\nPropriétaire: ${instanceOwner}\n\nLe bot est maintenant prêt à répondre aux commandes.`
    );
  },
};