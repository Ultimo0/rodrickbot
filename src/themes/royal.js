/**
 * Thème Royal — interface premium, élégante et lisible sur WhatsApp.
 * Aucun bouton interactif : navigation 100 % texte via /menu <categorie>
 * et /menu <commande>.
 */
import { boxTop, boxBottom, hLine } from '../utils/boxDrawing.js';
import { toBoldFont } from '../utils/fancyFont.js';
import { pickRandom } from '../utils/pickRandom.js';

const BOX = { tl: '╔', tr: '╗', bl: '╚', br: '╝', h: '═' };
const INNER = 18;
const ACCENT = '👑';
const bold = toBoldFont;

function title(text, icon = ACCENT) {
  return `${icon} ${bold(String(text).toUpperCase())}`;
}

function footer({ version, prefix, developerName }) {
  return [
    hLine(INNER, '─'),
    `${ACCENT} ${bold('Version')} ${version}  •  ${bold('Préfixe')} ${prefix}`,
    `   ${bold('Développeur')} : ${developerName}`,
    '✦ Tape /menu <commande> pour les détails ✦',
  ].join('\n');
}

function statLine(icon, label, value) {
  return `${icon} ${bold(label.padEnd(14, ' '))} ${value}`;
}

export default {
  name: 'royal',
  label: 'Royal',

  renderMainMenu(data) {
    const lines = [
      boxTop(INNER, BOX),
      `${ACCENT}  ${bold(data.botName.toUpperCase())}  ${ACCENT}`,
      `      ${bold('ROYAL EDITION')}`,
      boxBottom(INNER, BOX),
      '',
      `✦ ${bold(`Bienvenue, ${data.senderName}`)} ✦`,
      '',
      statLine('📅', 'Date', data.dateStr),
      statLine('🕐', 'Heure', data.timeStr),
      statLine('⏱️', 'Uptime', data.uptime),
      statLine('⚡', 'Latence', `${data.ping} ms`),
      statLine('💾', 'Mémoire', `${data.ramMb} Mo`),
      statLine('🔐', 'Mode', data.mode),
      statLine('📦', 'Commandes', data.commandCount),
      statLine(ACCENT, 'Thème', data.themeLabel),
      '',
      boxTop(INNER, BOX),
      `   ${bold('✦ CENTRE DE COMMANDE ✦')}`,
      boxBottom(INNER, BOX),
      '',
    ];

    for (const cat of data.categories) {
      lines.push(`${cat.icon} ${bold(cat.label)}  ›  ${cat.count}`);
    }

    lines.push('', `╭─ ${bold('NAVIGATION')} ─╮`);
    for (const cat of data.categories) {
      lines.push(`│ ${cat.icon} ${data.prefix}menu ${cat.key}`);
    }
    lines.push('╰────────────────╯');
    lines.push('', `💡 ${bold('Astuce')} : ${data.prefix}menu <commande>`, '', footer(data.footer));
    return lines.join('\n');
  },

  renderCategoryMenu(data) {
    const lines = [
      boxTop(INNER, BOX),
      ` ${data.category.icon}  ${bold(data.category.label.toUpperCase())}`,
      boxBottom(INNER, BOX),
      '',
      `✦ ${data.commands.length} commande(s) disponible(s) ✦`,
      '',
    ];

    for (const cmd of data.commands) {
      lines.push(`◆ ${bold(data.prefix + cmd.name)}${cmd.tagsSuffix}`);
      lines.push(`   ${cmd.description}`);
      lines.push('');
    }

    if (!data.commands.length) {
      lines.push('◆ Aucune commande disponible dans cette catégorie pour le moment.', '');
    }

    lines.push(`↩ ${data.prefix}menu  •  ${data.prefix}menu <commande>`, '', footer(data.footer));
    return lines.join('\n');
  },

  renderCommandDetail(data) {
    const lines = [
      boxTop(INNER, BOX),
      `  ${ACCENT} ${bold(data.prefix + data.cmd.name)}`,
      boxBottom(INNER, BOX),
      '',
      `✦ ${data.cmd.description}${data.cmd.tagsSuffix}`,
    ];

    if (data.cmd.category) lines.push('', `${bold('Catégorie')} : ${data.cmd.category}`);
    if (data.cmd.aliases.length) lines.push(`${bold('Alias')} : ${data.cmd.aliases.join(', ')}`);
    lines.push('', `↩ Retour : ${data.prefix}menu`, '', footer(data.footer));
    return lines.join('\n');
  },

  renderStartup(data) {
    const lines = [boxTop(INNER, BOX), `   ${ACCENT} ${bold(data.botName)} ${ACCENT}`, boxBottom(INNER, BOX), ''];

    if (data.configured) {
      lines.push(`◆ ${bold('Statut')}`, '  ✅ Configurée', '');
      lines.push(`◆ ${bold('Instance')}`, `  ${data.instanceId}`, '');
      lines.push(`◆ ${bold('Propriétaire')}`, `  ${data.instanceOwner}`);
    } else {
      lines.push(`◆ ${bold('Statut')}`, '  ⚠️ Non configurée', '');
      lines.push(`◆ ${bold('À faire')}`, `  ${data.prefix}setup <identifiant> <propriétaire>`);
    }

    lines.push('', `◆ ${bold('Commandes chargées')}`, `  ${data.commandCount}`);
    lines.push('', `◆ ${bold('Mode')}`, `  ${data.mode}`);

    if (data.apiKeys?.length) {
      lines.push('', `◆ ${bold('Clés API')}`);
      for (const k of data.apiKeys) {
        lines.push(`  ${k.configured ? '✅' : '❌'} ${k.label}`);
      }
    }

    lines.push(hLine(INNER, BOX.h), `> ${bold(data.signature)}`);
    return lines.join('\n');
  },

  renderWelcome(data) {
    const [tagline, closing] = pickRandom([
      ['👑 Que votre passage ici soit digne de la royauté.', '✦ Sois le bienvenu parmi nous ✦'],
      ['👑 Le trône t’attendait — la couronne arrive dès que le stock est réapprovisionné.', '✦ Longue vie à toi dans ce royaume ✦'],
      ['👑 Un nouveau sujet royal vient d’arriver, inclinez-vous (un tout petit peu suffira).', '✦ Bienvenue, noble visiteur ✦'],
    ]);

    return [
      boxTop(INNER, BOX),
      `${ACCENT}  ${bold('BIENVENUE')}  ${ACCENT}`,
      boxBottom(INNER, BOX),
      '',
      `✦ ${bold('Nouveau membre')} ✦`,
      `◆ Utilisateur : @${data.number}`,
      `◆ Groupe : ${bold(data.groupName)}`,
      '', tagline, '',
      `◆ ${bold('Étiquette')}`,
      '  Respect · Élégance · Entraide',
      '', closing,
    ].join('\n');
  },

  renderBye(data) {
    return [
      boxTop(INNER, BOX), `${ACCENT} ${bold('DÉPART')}`, boxBottom(INNER, BOX), '',
      `◆ @${data.number} quitte ${bold(data.groupName)}.`, '',
      '🙏 Merci pour votre présence parmi nous.', '✦ Bonne route ✦',
    ].join('\n');
  },

  renderDeletedMessages(data) {
    const lines = [boxTop(INNER, BOX), `   🗑 ${bold('MESSAGES SUPPRIMÉS')}`, boxBottom(INNER, BOX), ''];
    if (!data.entries.length) {
      lines.push('◆ Aucun message supprimé récemment dans ce chat.');
    } else {
      for (const e of data.entries) {
        lines.push(`◆ ${bold(`#${e.index} · ${e.typeLabel}`)}`);
        lines.push(`   Supprimé par : ${e.authorLabel}`, `   ${e.whenLabel}`);
        if (e.textContent) lines.push(`   ✦ ${e.textContent}`);
        lines.push('');
      }
    }
    lines.push(footer(data.footer));
    return lines.join('\n');
  },

  renderActivityGroup(data) {
    const lines = [boxTop(INNER, BOX), `   📊 ${bold('ACTIVITÉ DU GROUPE')}`, boxBottom(INNER, BOX), ''];
    if (data.mode === 'summary') {
      lines.push(`◆ ${bold('Membres')}    ${data.memberCount}`, `◆ ${bold('Aujourd’hui')} ${data.today} messages`, `◆ ${bold('Semaine')}    ${data.week} messages`, `◆ ${bold('Mois')}       ${data.month} messages`);
    } else if (data.mode === 'period') {
      lines.push(`◆ ${bold(data.periodLabel)} : ${data.periodCount} messages`);
    } else if (data.mode === 'top') {
      lines.push(`✦ ${bold('Top membres')} · ${data.periodLabel} ✦`);
    }
    if (data.top.length) {
      lines.push('', `✦ ${bold('Membres les plus actifs')} ✦`, '');
      data.top.forEach((u, i) => lines.push(`◆ ${bold(String(i + 1))}. ${u.label} — ${u.count} messages`));
    } else if (data.mode !== 'summary') lines.push('', 'Aucune activité sur cette période.');
    if (data.lastActivityLabel) lines.push('', `◆ ${bold('Dernière activité')}`, `  ${data.lastActivityLabel}`);
    lines.push('', footer(data.footer));
    return lines.join('\n');
  },

  renderActivityUser(data) {
    return [
      boxTop(INNER, BOX), `   📊 ${bold(`ACTIVITÉ DE ${data.userLabel}`)}`, boxBottom(INNER, BOX), '',
      `◆ ${bold('Messages')} : ${data.total}`, '',
      `◆ ${bold('Aujourd’hui')}  ${data.today}`, `◆ ${bold('Semaine')}     ${data.week}`, `◆ ${bold('Mois')}        ${data.month}`, '',
      `◆ ${bold('Dernière activité')}`, `  ${data.lastActivityLabel}`, '', footer(data.footer),
    ].join('\n');
  },

  renderInactive(data) {
    const lines = [boxTop(INNER, BOX), `   👻 ${bold('MEMBRES INACTIFS')}`, boxBottom(INNER, BOX), ''];
    lines.push(`◆ Aucune activité depuis ${data.minDaysLabel} :`, '');
    if (!data.inactive.length) lines.push('✦ Aucun membre inactif sur cette période ✦');
    else for (const m of data.inactive) lines.push(`◆ ${m.label}`);
    if (data.unknownCount > 0) lines.push('', `${data.unknownCount} membre(s) sans donnée connue (non pris en compte ci-dessus).`);
    lines.push('', footer(data.footer));
    return lines.join('\n');
  },

  renderStats(data) {
    const lines = [
      boxTop(INNER, BOX), `   📊 ${bold('STATISTIQUES')}`, boxBottom(INNER, BOX), '',
      `◆ ${bold('Uptime')}             ${data.uptime}`,
      `◆ ${bold('Messages')}           ${data.messages}`,
      `◆ ${bold('Commandes exécutées')} ${data.totalCommands}`,
      `◆ ${bold('Commandes uniques')}   ${data.uniqueCommands}`,
      `◆ ${bold('Mode')}               ${data.mode}`,
      `◆ ${bold('Instance')}           ${data.instanceId}`,
      `◆ ${bold('Propriétaire')}       ${data.instanceOwner}`,
      '',
    ];
    if (data.topCommands.length) {
      lines.push(`✦ ${bold('TOP COMMANDES')} ✦`, '');
      data.topCommands.forEach((cmd, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        lines.push(`${medal} ${bold(cmd.name)} — ${cmd.count} exécution(s)`);
      });
    } else lines.push('◆ Aucune commande exécutée pour le moment.');
    lines.push('', footer(data.footer));
    return lines.join('\n');
  },
};
