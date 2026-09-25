/**
 * Outil de connaissance du bot — permet à l'agent de répondre avec
 * exactitude sur RodrickBOT lui-même : identité, liste des commandes
 * disponibles, ou fonctionnement précis d'une commande donnée.
 *
 * Construit sur les métadonnées déjà déclarées par chaque commande
 * (name/aliases/description/category/adminOnly/privateOnly) — jamais
 * recopiées à la main, donc jamais désynchronisées quand une commande est
 * ajoutée ou modifiée dans commands/ (même principe que getIntentToolNames()
 * dans toolRegistry.js).
 *
 * Garde-fou structurel : cet outil ne lit AUCUN fichier source et n'a
 * jamais accès à `command.execute` (la fonction elle-même n'est jamais
 * lue ni exposée) — seuls les champs listés dans describeCommand() peuvent
 * sortir de cet outil, quelle que soit la question posée. Le filtre
 * CODE_REQUEST_PATTERN ci-dessous est une couche supplémentaire, pas LA
 * protection : la vraie garantie, c'est qu'il n'y a tout simplement rien
 * ici qui puisse lire ou renvoyer le contenu d'un fichier .js du projet.
 */

import { config } from '../../config/index.js';
import { groupByCategory } from '../../utils/helpers.js';

const CODE_REQUEST_PATTERN =
  /(code\s*source|colle\s+(le\s+)?(code|fichier)|montre\s+(moi\s+)?le\s+code|contenu\s+du\s+fichier|source\s+de\s+la\s+commande|\.js\b)/i;

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function stripPrefix(word = '') {
  return word.startsWith(config.prefix) ? word.slice(config.prefix.length) : word;
}

/** Ne renvoie QUE les champs de métadonnées publics d'une commande. */
function describeCommand(cmd) {
  const tags = [];
  tags.push(cmd.adminOnly ? 'réservée aux admins' : 'ouverte à tous');
  tags.push(cmd.privateOnly !== false ? 'privé uniquement' : 'utilisable en groupe');

  const aliases = cmd.aliases?.length ? ` (alias: ${cmd.aliases.join(', ')})` : '';
  const description = (cmd.description || 'Pas de description disponible.').replaceAll('{prefix}', config.prefix);

  return [
    `*${config.prefix}${cmd.name}*${aliases}`,
    cmd.category ? `Catégorie : ${cmd.category}` : null,
    description,
    `Accès : ${tags.join(', ')}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function findCommand(commands, query) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  for (const word of words) {
    const candidate = commands.get(stripPrefix(word));
    if (candidate) return candidate;
  }
  return null;
}

function listByCategory(commands) {
  const unique = [...new Set(commands.values())];
  const groups = groupByCategory(unique);
  const lines = [];
  for (const [category, cmds] of groups) {
    lines.push(`*${category}* : ${cmds.map((c) => `${config.prefix}${c.name}`).join(', ')}`);
  }
  return lines.join('\n\n');
}

function identityBlock() {
  return [
    `RodrickBOT est un bot WhatsApp développé par ${config.developerName}.`,
    `Préfixe actuel des commandes : "${config.prefix}".`,
    "Il combine modération de groupe, utilitaires, téléchargement média, et un module d'intelligence artificielle (dont un mode agent conversationnel).",
  ].join(' ');
}

export const botInfoTool = {
  name: 'bot_info',
  description:
    "Répond aux questions sur RodrickBOT lui-même : identité du bot, liste de ses commandes, ou fonctionnement précis d'une commande donnée. N'expose jamais de code source.",
  params: [
    { name: 'query', type: 'string', required: true, description: "Question posée sur le bot, ou nom d'une commande" },
  ],
  execute: async ({ query, commands }) => {
    if (CODE_REQUEST_PATTERN.test(query || '')) {
      return "Je peux t'expliquer ce que fait une commande et comment l'utiliser, mais le code source de RodrickBOT n'est pas quelque chose que je peux montrer ou reproduire.";
    }

    if (!commands || commands.size === 0) {
      return identityBlock();
    }

    const specific = findCommand(commands, query);
    if (specific) {
      return describeCommand(specific);
    }

    if (/(liste|toutes les commandes|quelles commandes|c est quoi tes commandes)/i.test(normalize(query))) {
      return `${identityBlock()}\n\n${listByCategory(commands)}`;
    }

    return identityBlock();
  },
};
