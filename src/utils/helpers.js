/**
 * Extrait le texte brut d'un message Baileys, quel que soit son type
 * (texte simple, légende d'image, message étendu, réponse à une liste, etc.)
 */
export function extractText(msg) {
  const m = msg.message;
  if (!m) return '';
  const doc = m.documentWithCaptionMessage?.message?.documentMessage || m.documentMessage;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    doc?.caption ||
    // Quand l'utilisateur tape sur une ligne du menu interactif, WhatsApp
    // renvoie l'ID de la ligne choisie (ex: "!ping") comme s'il l'avait tapé.
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

/**
 * Récupère l'URL cachée dans l'aperçu de lien enrichi (contextInfo.externalAdReply)
 * d'un extendedTextMessage. Utile pour les partages natifs depuis d'autres apps
 * (ex: bouton "Partager" d'un Reel Facebook) : WhatsApp affiche une carte riche
 * (miniature vidéo, titre, domaine) mais le champ `.text` visible peut être vide
 * ou ne pas contenir l'URL elle-même — seul externalAdReply.sourceUrl (ou
 * mediaUrl) la porte. extractText() ne regarde pas cet endroit ; ce helper est
 * dédié aux modules qui doivent détecter TOUS les liens (antilink,
 * antilien-domaine), pas à l'extraction générale du texte tapé par
 * l'utilisateur.
 */
export function extractLinkPreviewUrl(msg) {
  const adReply = msg.message?.extendedTextMessage?.contextInfo?.externalAdReply;
  return adReply?.sourceUrl || adReply?.mediaUrl || '';
}

/** true si le message vient d'un groupe */
export function isGroup(jid) {
  return jid.endsWith('@g.us');
}

/** Sépare "!ping foo bar" en { command: 'ping', args: ['foo', 'bar'] } */
export function parseCommand(text, prefix) {
  if (!text?.startsWith(prefix)) return null;
  const [command, ...args] = text.slice(prefix.length).trim().split(/\s+/);
  return { command: command.toLowerCase(), args };
}

// Vocabulaire strict autorisé pour les arguments en reconnaissance SANS
// préfixe (mode agent) : "on"/"off"/"status" (la quasi-totalité des
// toggles du bot) ou une suite de chiffres (numéro de téléphone pour
// !addadmin, etc.). N'importe quel autre mot (phrase normale, ponctuation)
// fait échouer la correspondance — c'est voulu : le but est justement de
// ne PAS intercepter une conversation naturelle avec l'agent IA qui
// commencerait par le même mot qu'une commande.
const NO_PREFIX_ARG_REGEX = /^(on|off|status)$|^\d+$/i;

/**
 * Reconnaissance de commande SANS préfixe, réservée au mode agent (voir
 * handleSingleMessage). Exige une correspondance EXACTE : le premier mot
 * doit être un nom de commande ou un alias connu, et tout le reste du
 * message doit être vide ou composé uniquement de mots du vocabulaire
 * ci-dessus. "Menu" ou "antilink on" matchent ; "menu du jour ?" ou
 * "ping moi si tu vois ça" ne matchent pas et partent vers l'IA comme une
 * conversation normale.
 */
export function tryParseNoPrefixCommand(text, commands) {
  const trimmed = text?.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;

  const [first, ...args] = trimmed.split(' ');
  const command = first.toLowerCase();

  if (!commands.has(command)) return null;
  if (!args.every((a) => NO_PREFIX_ARG_REGEX.test(a))) return null;

  return { command, args };
}

/**
 * Transforme un texte en bloc citation WhatsApp (chaque ligne préfixée
 * par "> "). Marqueur volontairement FIXE, non thémé (identité visuelle
 * constante du bot) — voir src/themes/ pour ce qui est thémé à la place.
 * Utilisé pour donner une identité visuelle cohérente à toutes les
 * réponses du bot — sauf le menu, qui a sa propre mise en page.
 */
export function toQuoteBlock(text) {
  return text
    .split('\n')
    .map((line) => (line.startsWith('>') ? line : `> ${line}`))
    .join('\n');
}

/** Regroupe une liste de commandes par catégorie, dans l'ordre d'apparition. */
export function groupByCategory(commandList) {
  const groups = new Map();
  for (const cmd of commandList) {
    const category = cmd.category || 'Général';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(cmd);
  }
  return groups;
}

/** Formate un nombre de secondes en durée lisible (ex: "2j 3h 14min 5s"). */
export function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d) parts.push(`${d}j`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}min`);
  parts.push(`${s}s`);
  return parts.join(' ');
}