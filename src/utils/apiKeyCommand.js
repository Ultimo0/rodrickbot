import { config, setApiKey, deleteApiKey } from '../config/index.js';

const DELETE_KEYWORDS = new Set(['off', 'supprimer', 'delete', 'del', 'reset']);

/**
 * Fabrique une commande de gestion de clé API (définir/supprimer/voir le
 * statut), pour éviter de dupliquer la même logique dans
 * commands/groqapi.js, commands/removeapi.js et commands/meteoapi.js.
 *
 * `privateOnly: true` est volontairement forcé dans la commande générée
 * (voir plus bas) : une clé tapée en clair dans un GROUPE serait visible
 * de tout le monde, admins ou non — ces commandes ne doivent être
 * utilisables qu'en message privé avec le bot.
 */
export function createApiKeyCommand({ name, aliases, field, label, helpUrl }) {
  return {
    name,
    aliases,
    description:
      `Définit ou supprime la clé API ${label}, stockée dans settings.json (jamais dans .env). ` +
      `Usage: {prefix}${name} <clé> pour la définir, {prefix}${name} off pour la supprimer, {prefix}${name} seul pour voir son statut.` +
      (helpUrl ? ` Clé disponible sur ${helpUrl}.` : ''),
    category: 'Administration',
    adminOnly: true,
    // Volontairement forcé : voir le commentaire de fonction ci-dessus.
    privateOnly: true,
    execute: async (ctx) => {
      const arg = ctx.args.join(' ').trim();

      if (!arg) {
        const status = config[field] ? '✅ configurée' : '❌ non configurée';
        await ctx.reply({
          text:
            `Clé ${label} : ${status}\n\n` +
            `Usage : !${name} <clé> pour la définir\n` +
            `        !${name} off pour la supprimer`,
        });
        return;
      }

      if (DELETE_KEYWORDS.has(arg.toLowerCase())) {
        deleteApiKey(field);
        await ctx.success(`🗑️ Clé ${label} supprimée.`);
        return;
      }

      setApiKey(field, arg);
      await ctx.success(`✅ Clé ${label} enregistrée.`);
    },
  };
}
