import { isInstanceConfigured, setInstance } from '../core/instance.js';
import { startTelemetry } from '../core/telemetry.js';
import { config } from '../config/index.js';
import { sendWithChannelCard } from '../utils/channelCard.js';

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

    await sendWelcomeGuide(ctx);
  },
};

/**
 * Message d'aide envoyé une seule fois, juste après la validation de
 * l'instance (!setup), pour orienter un nouvel utilisateur qui découvre
 * le bot. N'est déclenché que par !setup — n'affecte aucune autre
 * commande ni aucun autre flux.
 */
async function sendWelcomeGuide(ctx) {
  const p = config.prefix;
  const botName = config.botName || 'RodrickBOT';

  const text =
    `👋 *Bienvenue sur ${botName} !*\n` +
    `Voici de quoi démarrer en 30 secondes.\n\n` +
    `📜 *${p}menu*\n` +
    `  Affiche toutes les commandes, classées par catégorie.\n\n` +
    `🏓 *${p}ping*\n` +
    `  Vérifie que le bot répond bien.\n\n` +
    `🔔 *${p}mention <texte>*\n` +
    `  Enregistre une réponse automatique envoyée chaque fois que tu es mentionné dans un groupe.\n\n` +
    `💤 *${p}afk <raison>*\n` +
    `  Te déclare absent : quiconque te mentionne en sera informé.\n\n` +
    `💾 *${p}save <nom>* _(en répondant à un message)_\n` +
    `  Sauvegarde un message pour le retrouver plus tard.\n\n` +
    `───────────────\n` +
    `💡 Astuce : *${p}menu <catégorie>* affiche uniquement les commandes d'une catégorie ` +
    `(ex. *${p}menu utilitaires*), et *${p}menu <commande>* affiche le détail d'une commande précise.\n\n` +
    `Besoin d'aide ? Tape *${p}menu* à tout moment.`;

  await sendWithChannelCard(ctx, text);
}