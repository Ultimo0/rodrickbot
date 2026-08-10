/**
 * Thème "Royal" : luxueux, premium, élégant — impression de qualité
 * supérieure. Police grasse Unicode pour les titres, bordures épaisses,
 * ornements "✦" en guise de fioritures, puces "◆".
 */
import { boxTop, boxBottom, hLine } from '../utils/boxDrawing.js';
import { toBoldFont } from '../utils/fancyFont.js';

const BOX = { tl: '┏', tr: '┓', bl: '┗', br: '┛', h: '━' };
const ACCENT = '👑';
const bold = toBoldFont;

function footer({ version, prefix, developerName }) {
  return [
    hLine(21, BOX.h),
    `${ACCENT} ${bold('Version')} ${version} · ${bold('Préfixe')} ${prefix}`,
    `   ${bold('Développeur')} : ${developerName}`,
  ].join('\n');
}

export default {
  name: 'royal',
  label: 'Royal',

  renderMainMenu(data) {
    const lines = [
      boxTop(18, BOX),
      `   ${ACCENT} ${bold(data.botName.toUpperCase())}`,
      boxBottom(18, BOX),
      '',
      `✦ Bienvenue, ${bold(data.senderName)} ✦`,
      '',
      `◆ ${bold('Date')}          ${data.dateStr}`,
      `◆ ${bold('Heure')}         ${data.timeStr}`,
      `◆ ${bold('Disponibilite')} ${data.uptime}`,
      `◆ ${bold('Latence')}       ${data.ping} ms`,
      `◆ ${bold('Memoire')}       ${data.ramMb} Mo`,
      `◆ ${bold('Mode')}          ${data.mode}`,
      `◆ ${bold('Commandes')}     ${data.commandCount}`,
      `◆ ${bold('Theme')}         ${ACCENT} ${data.themeLabel}`,
      '',
      boxTop(18, BOX),
      `   📂 ${bold('CATEGORIES')}`,
      boxBottom(18, BOX),
      '',
    ];

    for (const cat of data.categories) {
      lines.push(`${cat.icon} ${bold(cat.label)} · ${cat.count}`);
    }

    lines.push('', `✦ Accède à un sous-menu ✦`);
    for (const cat of data.categories) {
      lines.push(`◆ ${data.prefix}menu ${cat.key}`);
    }

    lines.push('', footer(data.footer));
    return lines.join('\n');
  },

  renderCategoryMenu(data) {
    const lines = [
      boxTop(19, BOX),
      ` ${data.category.icon} ${bold(data.category.label.toUpperCase())}`,
      boxBottom(19, BOX),
      '',
    ];

    for (const cmd of data.commands) {
      lines.push(`◆ ${bold(data.prefix + cmd.name)}${cmd.tagsSuffix}`);
      lines.push(`   ${cmd.description}`);
      lines.push('');
    }

    if (!data.commands.length) {
      lines.push('Aucune commande disponible dans cette catégorie pour le moment.', '');
    }

    lines.push(`✦ Retour au menu : ${data.prefix}menu`, '', footer(data.footer));
    return lines.join('\n');
  },

  renderCommandDetail(data) {
    const lines = [
      boxTop(19, BOX),
      ` ◆ ${bold(data.prefix + data.cmd.name)}`,
      boxBottom(19, BOX),
      '',
      `${data.cmd.description}${data.cmd.tagsSuffix}`,
    ];

    if (data.cmd.category) lines.push(`${bold('Categorie')} : ${data.cmd.category}`);
    if (data.cmd.aliases.length) lines.push(`${bold('Alias')} : ${data.cmd.aliases.join(', ')}`);
    lines.push('', footer(data.footer));

    return lines.join('\n');
  },

  renderStartup(data) {
    const lines = [boxTop(19, BOX), `   ${ACCENT} ${bold(data.botName)}`, boxBottom(19, BOX), ''];

    if (data.configured) {
      lines.push(`◆ ${bold('Statut')}`, '  ✅ Configurée', '');
      lines.push(`◆ ${bold('Instance')}`, `  ${data.instanceId}`, '');
      lines.push(`◆ ${bold('Proprietaire')}`, `  ${data.instanceOwner}`);
    } else {
      lines.push(`◆ ${bold('Statut')}`, '  ⚠️ Non configurée', '');
      lines.push(`◆ ${bold('A faire')}`, `  ${data.prefix}setup <identifiant> <propriétaire>`);
    }

    lines.push('', `◆ ${bold('Commandes chargees')}`, `  ${data.commandCount}`);
    lines.push('', `◆ ${bold('Mode')}`, `  ${data.mode}`);
    lines.push(hLine(22, BOX.h));
    // Marqueur "> " volontairement fixe, non thémé — identité visuelle
    // constante du bot, quel que soit le thème actif.
    lines.push(`> ${bold(data.signature)}`);

    return lines.join('\n');
  },

  renderWelcome(data) {
    return [
      boxTop(20, BOX),
      `${ACCENT}  ${bold('BIENVENUE')}  ${ACCENT}`,
      boxBottom(20, BOX),
      '',
      `✦ ${bold('Nouveau membre')} ✦`,
      `◆ Utilisateur : @${data.number}`,
      `◆ Groupe : ${bold(data.groupName)}`,
      '',
      `👑 Que votre passage ici soit digne de la royauté.`,
      '',
      `◆ ${bold('Etiquette')}`,
      '  Respect · Elégance · Entraide',
      '',
      '✦ Sois le bienvenu parmi nous ✦',
    ].join('\n');
  },

  renderBye(data) {
    return [
      boxTop(18, BOX),
      `${ACCENT} ${bold('DEPART')}`,
      boxBottom(18, BOX),
      '',
      `◆ @${data.number} quitte ${bold(data.groupName)}.`,
      '',
      '🙏 Merci pour votre présence parmi nous.',
      '✦ Bonne route ✦',
    ].join('\n');
  },

  renderDeletedMessages(data) {
    const lines = [boxTop(19, BOX), `   🗑 ${bold('MESSAGES SUPPRIMES')}`, boxBottom(19, BOX), ''];

    if (!data.entries.length) {
      lines.push('◆ Aucun message supprimé récemment dans ce chat.');
    } else {
      for (const e of data.entries) {
        lines.push(`◆ ${bold(`#${e.index} · ${e.typeLabel}`)}`);
        lines.push(`   Supprimé par : ${e.authorLabel}`);
        lines.push(`   ${e.whenLabel}`);
        if (e.textContent) lines.push(`   ✦ ${e.textContent}`);
        lines.push('');
      }
    }

    lines.push(footer(data.footer));
    return lines.join('\n');
  },
};
