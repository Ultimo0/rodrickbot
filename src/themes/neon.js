/**
 * Thème "Neon" : interface cyberpunk inspirée d'un système d'exploitation
 * futuriste. Vocabulaire système (CORE, MODULES, STATUS, ONLINE) pour
 * l'immersion, bordures doubles, prompts façon terminal.
 */
import { boxTop, boxBottom, hLine } from '../utils/boxDrawing.js';
import { toSansBoldFont } from '../utils/fancyFont.js';

const BOX = { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═' };
const ACCENT = '⚡';
const upper = toSansBoldFont;

function footer({ version, prefix, developerName }) {
  return [
    hLine(21, BOX.h),
    `SYS::STATUS ONLINE | v${version} | PREFIX "${prefix}"`,
    `DEV:: ${developerName}`,
  ].join('\n');
}

export default {
  name: 'neon',
  label: 'Neon',

  renderMainMenu(data) {
    const lines = [
      boxTop(18, BOX),
      `  ${ACCENT} ${upper(data.botName.toUpperCase())} :: CORE`,
      boxBottom(18, BOX),
      '',
      `> USER........... ${data.senderName}`,
      `> DATE........... ${data.dateStr}`,
      `> TIME........... ${data.timeStr}`,
      `> UPTIME......... ${data.uptime}`,
      `> PING........... ${data.ping}ms`,
      `> RAM............ ${data.ramMb}Mo`,
      `> MODE........... ${data.mode.toUpperCase()}`,
      `> COMMANDS....... ${data.commandCount}`,
      `> THEME.......... ${data.themeLabel.toUpperCase()} ${ACCENT}`,
      '',
      boxTop(18, BOX),
      `  📡 ${upper('MODULES ACTIFS')}`,
      boxBottom(18, BOX),
      '',
    ];

    for (const cat of data.categories) {
      lines.push(`[${cat.icon}] ${cat.label.toUpperCase().replace(/ /g, '_')} :: ${cat.count} module(s)`);
    }

    lines.push('', '>> ACCÈS SOUS-MODULE :');
    for (const cat of data.categories) {
      lines.push(`$ ${data.prefix}menu ${cat.key}`);
    }

    lines.push('', footer(data.footer));
    return lines.join('\n');
  },

  renderCategoryMenu(data) {
    const lines = [
      boxTop(19, BOX),
      ` [${data.category.icon}] ${upper(data.category.label.toUpperCase())}`,
      boxBottom(19, BOX),
      '',
    ];

    for (const cmd of data.commands) {
      lines.push(`$ ${data.prefix}${cmd.name}${cmd.tagsSuffix}`);
      lines.push(`   ${cmd.description}`);
      lines.push('');
    }

    if (!data.commands.length) {
      lines.push('>> AUCUN MODULE DISPONIBLE DANS CETTE CATEGORIE.', '');
    }

    lines.push(`<< RETOUR :: ${data.prefix}menu`, '', footer(data.footer));
    return lines.join('\n');
  },

  renderCommandDetail(data) {
    const lines = [
      boxTop(19, BOX),
      ` $ ${data.prefix}${data.cmd.name}`,
      boxBottom(19, BOX),
      '',
      `${data.cmd.description}${data.cmd.tagsSuffix}`,
    ];

    if (data.cmd.category) lines.push(`MODULE:: ${data.cmd.category}`);
    if (data.cmd.aliases.length) lines.push(`ALIAS:: ${data.cmd.aliases.join(', ')}`);
    lines.push('', footer(data.footer));

    return lines.join('\n');
  },

  renderStartup(data) {
    const lines = [boxTop(19, BOX), `  ${ACCENT} ${upper(data.botName)} :: BOOT`, boxBottom(19, BOX), ''];

    if (data.configured) {
      lines.push(`> STATUS.......... ONLINE ✅`);
      lines.push(`> INSTANCE........ ${data.instanceId}`);
      lines.push(`> OWNER........... ${data.instanceOwner}`);
    } else {
      lines.push(`> STATUS.......... UNCONFIGURED ⚠️`);
      lines.push(`> ACTION_REQUISE.. ${data.prefix}setup <identifiant> <propriétaire>`);
    }

    lines.push(`> MODULES_LOADED.. ${data.commandCount}`);
    lines.push(`> MODE............ ${data.mode.toUpperCase()}`);
    lines.push(hLine(22, BOX.h));
    // Marqueur "> " volontairement fixe, non thémé — identité visuelle
    // constante du bot, quel que soit le thème actif.
    lines.push(`> ${upper(data.signature)}`);

    return lines.join('\n');
  },

  renderWelcome(data) {
    return [
      boxTop(20, BOX),
      `${ACCENT} ${upper('NEW CONNECTION')} ${ACCENT}`,
      boxBottom(20, BOX),
      '',
      `> USER........... @${data.number}`,
      `> NODE........... ${data.groupName}`,
      `> STATUS......... CONNECTED ✅`,
      '',
      '>> Bienvenue dans le système.',
      '>> Synchronisation avec les autres modules en cours...',
    ].join('\n');
  },

  renderBye(data) {
    return [
      boxTop(18, BOX),
      `${ACCENT} ${upper('DISCONNECT')}`,
      boxBottom(18, BOX),
      '',
      `> USER........... @${data.number}`,
      `> NODE........... ${data.groupName}`,
      `> STATUS......... DISCONNECTED ❌`,
      '',
      '>> Connexion terminée.',
    ].join('\n');
  },

  renderDeletedMessages(data) {
    const lines = [boxTop(19, BOX), `  ${ACCENT} ${upper('LOGS SUPPRIMES')}`, boxBottom(19, BOX), ''];

    if (!data.entries.length) {
      lines.push('>> AUCUN LOG SUPPRIME RECEMMENT DANS CE CANAL.');
    } else {
      for (const e of data.entries) {
        lines.push(`[${e.icon}] ENTRY_${String(e.index).padStart(2, '0')} :: ${e.typeLabel.toUpperCase()}`);
        lines.push(`> AUTHOR.......... ${e.authorLabel}`);
        lines.push(`> TIMESTAMP....... ${e.whenLabel}`);
        if (e.textContent) lines.push(`> PAYLOAD......... ${e.textContent}`);
        lines.push('');
      }
    }

    lines.push(footer(data.footer));
    return lines.join('\n');
  },
};
