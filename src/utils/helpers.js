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