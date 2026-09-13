import { readFileSync } from 'fs';
import fs from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { groupByCategory, formatUptime } from '../utils/helpers.js';
import { isLockdownMode } from '../core/state.js';
import { sendWithChannelCard } from '../utils/channelCard.js';
import { getCurrentTheme } from '../themes/engine.js';
import { logger } from '../utils/logger.js';
import { toVoiceNoteOgg } from '../utils/mediaConvert.js';

const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));

// Catégories affichées dans le menu principal, dans cet ordre. `key` est ce
// que l'utilisateur tape après !menu (ex: "!menu groupe"), `category` doit
// correspondre exactement au champ `category` déclaré dans chaque commande.
const CATEGORY_MENU = [
  { key: 'groupe', icon: '👥', label: 'Gestion du groupe', category: 'Gestion de groupe' },
  { key: 'admin', icon: '🛡', label: 'Administration', category: 'Administration' },
  { key: 'moderation', icon: '🚨', label: 'Modération', category: 'Modération' },
  { key: 'diagnostic', icon: '📊', label: 'Diagnostic', category: 'Diagnostic' },
  { key: 'utilitaires', icon: '🛠', label: 'Utilitaires', category: 'Utilitaires' },
  { key: 'media', icon: '🖼', label: 'Média', category: 'Média' },
  { key: 'telechargement', icon: '📥', label: 'Téléchargement', category: 'Téléchargement' },
  { key: 'sauvegardes', icon: '📁', label: 'Sauvegardes', category: 'Sauvegardes' },
  { key: 'ia', icon: '🤖', label: 'Intelligence Artificielle', category: 'Intelligence Artificielle' },
  { key: 'jeux', icon: '🎮', label: 'Jeux', category: 'Jeux' },
];

function footerData() {
  return { version: pkg.version, prefix: config.prefix, developerName: config.developerName };
}

function commandTagsSuffix(cmd) {
  const tags = [];
  if (cmd.adminOnly) tags.push('admin');
  if (cmd.privateOnly !== false) tags.push('privé');
  return tags.length ? ` _(${tags.join(', ')})_` : '';
}

/** Remplace le placeholder {prefix} par le préfixe courant dans une description. */
function withPrefix(text) {
  return (text || '').replaceAll('{prefix}', config.prefix);
}

function getVisibleCommands(ctx) {
  const uniqueCommands = [...new Set(ctx.commands.values())];
  return uniqueCommands.filter((cmd) => {
    if (cmd.name === 'help') return false;
    if (cmd.adminOnly && !ctx.isAdmin) return false;
    if (ctx.isGroup && cmd.privateOnly !== false) return false;
    return true;
  });
}

/**
 * Recherche un fichier audio dans le dossier `assets/` avec l'une des
 * extensions supportées (mp3, m4a, ogg, wav, aac). Retourne le chemin
 * complet du premier trouvé, ou null.
 */
function findAudioFile() {
  const assetsDir = path.join(process.cwd(), 'assets');
  if (!fs.existsSync(assetsDir)) return null;

  const supportedExtensions = ['.mp3', '.m4a', '.ogg', '.wav', '.aac'];
  const files = fs.readdirSync(assetsDir);
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (supportedExtensions.includes(ext)) {
      const fullPath = path.join(assetsDir, file);
      // Vérifier que c'est bien un fichier (pas un dossier)
      if (fs.statSync(fullPath).isFile()) {
        return fullPath;
      }
    }
  }
  return null;
}

/**
 * Envoie l'audio du menu principal en véritable note vocale WhatsApp
 * (ptt: true). Repasse systématiquement par `toVoiceNoteOgg` (même
 * méthode que !mention, voir utils/mediaConvert.js) plutôt que d'envoyer
 * le fichier brut de assets/ tel quel — un mp3/m4a envoyé avec `ptt: true`
 * sans être réencodé en OGG/Opus ne s'affiche pas comme note vocale sur
 * WhatsApp (juste un fichier audio avec un rond de lecture cassé).
 */
async function sendMenuAudio(ctx) {
  try {
    const audioPath = findAudioFile();
    if (!audioPath) {
      logger.debug('Aucun fichier audio trouvé pour le menu principal (assets/ avec .mp3/.m4a/.ogg/.wav/.aac)');
      return;
    }

    const rawBuffer = fs.readFileSync(audioPath);
    const { buffer: pttBuffer, seconds } = await toVoiceNoteOgg(rawBuffer);

    await ctx.sock.sendMessage(
      ctx.chatId,
      {
        audio: pttBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        seconds,
      },
      { quoted: ctx.msg }
    );

    logger.info(`Note vocale du menu principal envoyée (${seconds}s)`);
  } catch (err) {
    // Une erreur ici ne doit pas faire planter l'envoi du menu
    logger.warn({ err }, "Impossible d'envoyer la note vocale du menu principal");
  }
}

/** Menu principal : infos du bot + liste des catégories. */
async function sendMainMenu(ctx, visibleCommands) {
  const senderName = ctx.msg.pushName || ctx.sender.split('@')[0];
  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR');
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const sentAt = Number(ctx.msg.messageTimestamp) * 1000;
  const ping = Date.now() - sentAt;
  const ramMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
  const mode = isLockdownMode() ? 'Privé' : 'Public';

  const grouped = groupByCategory(visibleCommands);
  const theme = getCurrentTheme();

  const categories = CATEGORY_MENU.map((entry) => ({
    key: entry.key,
    icon: entry.icon,
    label: entry.label,
    count: grouped.get(entry.category)?.length || 0,
  })).filter((entry) => entry.count > 0);

  const text = theme.renderMainMenu({
    botName: config.botName,
    senderName,
    dateStr,
    timeStr,
    uptime: formatUptime(process.uptime()),
    ping,
    ramMb,
    mode,
    commandCount: visibleCommands.length,
    themeLabel: theme.label,
    categories,
    prefix: config.prefix,
    footer: footerData(),
  });

  // Envoi du menu (texte avec image éventuelle)
  await sendWithChannelCard(ctx, text, { asImage: true });

  // Envoi de l'audio (uniquement pour le menu principal)
  await sendMenuAudio(ctx);
}

/** Sous-menu : uniquement les commandes de la catégorie demandée. */
async function sendCategoryMenu(ctx, entry, visibleCommands) {
  const grouped = groupByCategory(visibleCommands);
  const cmds = grouped.get(entry.category) || [];
  const theme = getCurrentTheme();

  const text = theme.renderCategoryMenu({
    category: { icon: entry.icon, label: entry.label },
    commands: cmds.map((cmd) => ({
      name: cmd.name,
      description: withPrefix(cmd.description),
      tagsSuffix: commandTagsSuffix(cmd),
    })),
    prefix: config.prefix,
    footer: footerData(),
  });

  await sendWithChannelCard(ctx, text);
}

/** Détail d'une commande précise. */
async function sendCommandDetail(ctx, cmd) {
  const theme = getCurrentTheme();

  const text = theme.renderCommandDetail({
    prefix: config.prefix,
    cmd: {
      name: cmd.name,
      description: withPrefix(cmd.description),
      tagsSuffix: commandTagsSuffix(cmd),
      category: cmd.category || null,
      aliases: cmd.aliases || [],
    },
    footer: footerData(),
  });

  await sendWithChannelCard(ctx, text);
}

export default {
  name: 'help',
  aliases: ['aide', 'menu'],
  description:
    "Affiche le menu principal (catégories), un sous-menu ({prefix}menu <categorie>), ou le détail d'une commande ({prefix}menu <commande>).",
  privateOnly: false,
  execute: async (ctx) => {
    // Réaction "parchemin" sur le message !menu lui-même — repère visuel
    // immédiat que la commande a bien été reçue, avant même l'envoi du
    // menu.
    await ctx.sock.sendMessage(ctx.chatId, { react: { text: '📜', key: ctx.msg.key } });

    const visibleCommands = getVisibleCommands(ctx);

    if (!ctx.args.length) {
      await sendMainMenu(ctx, visibleCommands);
      return;
    }

    const query = ctx.args[0].toLowerCase();

    // 1) "!menu <categorie>" — sous-menu par catégorie
    const categoryEntry = CATEGORY_MENU.find((entry) => entry.key === query);
    if (categoryEntry) {
      await sendCategoryMenu(ctx, categoryEntry, visibleCommands);
      return;
    }

    // 2) "!menu <commande>" — détail d'une commande
    const cmd = ctx.commands.get(query);
    if (!cmd || (cmd.adminOnly && !ctx.isAdmin)) {
      await ctx.error(`❌ "${query}" n'est ni une catégorie ni une commande connue. Tape ${config.prefix}menu pour voir les catégories.`);
      return;
    }

    await sendCommandDetail(ctx, cmd);
  },
};