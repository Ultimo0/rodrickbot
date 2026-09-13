/**
 * Thème "Classique" : sobre, simple, très lisible, compatible avec tous
 * les appareils. Contrairement aux autres thèmes, aucune police Unicode
 * stylisée n'est utilisée pour les titres (juste du gras WhatsApp *ainsi*)
 * — c'est un choix délibéré pour maximiser la lisibilité et éviter les
 * soucis de rendu sur les téléphones/polices exotiques.
 */
import { boxTop, boxBottom, hLine } from '../utils/boxDrawing.js';
import { pickRandom } from '../utils/pickRandom.js';

const BOX = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─' };
const ACCENT = '🤖';

function footer({ version, prefix, developerName }) {
  return [hLine(19, BOX.h), `Version : ${version} · Préfixe : ${prefix}`, `Développeur : ${developerName}`].join(
    '\n'
  );
}

export default {
  name: 'classique',
  label: 'Classique',

  renderMainMenu(data) {
    const lines = [
      boxTop(18, BOX),
      `   ${ACCENT} *${data.botName.toUpperCase()}*`,
      boxBottom(18, BOX),
      '',
      `👤 Utilisateur : ${data.senderName}`,
      `📅 Date : ${data.dateStr}`,
      `⏰ Heure : ${data.timeStr}`,
      `⏱ Uptime : ${data.uptime}`,
      `📶 Ping : ${data.ping} ms`,
      `💾 RAM : ${data.ramMb} Mo`,
      `🔒 Mode : ${data.mode}`,
      `📊 Commandes : ${data.commandCount}`,
      `🎨 Thème : ${ACCENT} ${data.themeLabel}`,
      '',
      boxTop(18, BOX),
      `    📂 *CATÉGORIES*`,
      boxBottom(18, BOX),
      '',
    ];

    for (const cat of data.categories) {
      lines.push(`${cat.icon} *${cat.label}* (${cat.count})`);
    }

    lines.push('', '💡 Accède à un sous-menu :');
    for (const cat of data.categories) {
      lines.push(`➜ ${data.prefix}menu ${cat.key}`);
    }

    lines.push('', footer(data.footer));
    return lines.join('\n');
  },

  renderCategoryMenu(data) {
    const lines = [
      boxTop(19, BOX),
      ` ${data.category.icon} *${data.category.label.toUpperCase()}*`,
      boxBottom(19, BOX),
      '',
    ];

    for (const cmd of data.commands) {
      lines.push(`➜ ${data.prefix}${cmd.name}${cmd.tagsSuffix}`);
      lines.push(`   ${cmd.description}`);
      lines.push('');
    }

    if (!data.commands.length) {
      lines.push('Aucune commande disponible dans cette catégorie pour le moment.', '');
    }

    lines.push(`Retour au menu : ${data.prefix}menu`, '', footer(data.footer));
    return lines.join('\n');
  },

  renderCommandDetail(data) {
    const lines = [
      boxTop(19, BOX),
      ` ➜ *${data.prefix}${data.cmd.name}*`,
      boxBottom(19, BOX),
      '',
      `${data.cmd.description}${data.cmd.tagsSuffix}`,
    ];

    if (data.cmd.category) lines.push(`Catégorie : ${data.cmd.category}`);
    if (data.cmd.aliases.length) lines.push(`Alias : ${data.cmd.aliases.join(', ')}`);
    lines.push('', footer(data.footer));

    return lines.join('\n');
  },

  renderStartup(data) {
    const lines = [boxTop(19, BOX), `   ${ACCENT} *${data.botName}*`, boxBottom(19, BOX), ''];

    if (data.configured) {
      lines.push('▸ *Statut*', '  ✅ Configurée', '');
      lines.push('▸ *Instance*', `  ${data.instanceId}`, '');
      lines.push('▸ *Propriétaire*', `  ${data.instanceOwner}`);
    } else {
      lines.push('▸ *Statut*', '  ⚠️ Non configurée', '');
      lines.push('▸ *A faire*', `  ${data.prefix}setup <identifiant> <propriétaire>`);
    }

    lines.push('', '▸ *Commandes chargées*', `  ${data.commandCount}`);
    lines.push('', '▸ *Mode*', `  ${data.mode}`);

    if (data.apiKeys?.length) {
      lines.push('', '▸ *Clés API*');
      for (const k of data.apiKeys) {
        lines.push(`  ${k.configured ? '✅' : '❌'} ${k.label}`);
      }
    }

    lines.push(hLine(22, BOX.h));
    // Le marqueur "> " est volontairement fixe, non thémé, quel que soit
    // le thème actif : c'est l'identité visuelle constante du bot.
    lines.push(`> ${data.signature}`);

    return lines.join('\n');
  },

  renderWelcome(data) {
    const [tagline, closing] = pickRandom([
      ['🎊 Toute la communauté te souhaite la bienvenue !', '🚀 Profite de ton séjour parmi nous !'],
      ['🎉 Une nouvelle personne, une nouvelle occasion de faire des blagues !', '🚀 Installe-toi, la bonne humeur est offerte !'],
      ['🥳 Prépare-toi à un accueil chaleureux (et à quelques memes).', '🚀 Bienvenue à bord !'],
    ]);

    return [
      boxTop(20, BOX),
      `${ACCENT}  WELCOME  ${ACCENT}`,
      boxBottom(20, BOX),
      '',
      `👤 Utilisateur : *@${data.number}*`,
      `🏡 Groupe : *${data.groupName}*`,
      '',
      tagline,
      '',
      '📜 *Règles*',
      '✅ Respect',
      '✅ Bonne humeur',
      '✅ Entraide',
      '',
      closing,
    ].join('\n');
  },

  renderBye(data) {
    return [
      boxTop(18, BOX),
      `${ACCENT} DÉPART D'UN MEMBRE`,
      boxBottom(18, BOX),
      '',
      `👤 *@${data.number}* a quitté *${data.groupName}*.`,
      '',
      '🙏 Merci pour le temps passé avec nous.',
      '🍀 Bonne chance pour la suite !',
    ].join('\n');
  },

  renderDeletedMessages(data) {
    const lines = [boxTop(19, BOX), `   🗑 *MESSAGES SUPPRIMÉS*`, boxBottom(19, BOX), ''];

    if (!data.entries.length) {
      lines.push('Aucun message supprimé récemment dans ce chat.');
    } else {
      for (const e of data.entries) {
        lines.push(`${e.icon} *#${e.index} · ${e.typeLabel}*`);
        lines.push(`👤 Supprimé par : ${e.authorLabel}`);
        lines.push(`🕒 ${e.whenLabel}`);
        if (e.textContent) lines.push(`💬 ${e.textContent}`);
        lines.push('');
      }
    }

    lines.push(footer(data.footer));
    return lines.join('\n');
  },

  renderActivityGroup(data) {
    const lines = [boxTop(19, BOX), `   📊 *ACTIVITÉ DU GROUPE*`, boxBottom(19, BOX), ''];

    if (data.mode === 'summary') {
      lines.push(`👥 Membres : ${data.memberCount}`);
      lines.push(`💬 Messages aujourd'hui : ${data.today}`);
      lines.push(`📅 Cette semaine : ${data.week}`);
      lines.push(`📆 Ce mois : ${data.month}`);
    } else if (data.mode === 'period') {
      lines.push(`📅 ${data.periodLabel} : ${data.periodCount} messages`);
    } else if (data.mode === 'top') {
      lines.push(`🏆 Top membres · ${data.periodLabel}`);
    }

    if (data.top.length) {
      lines.push('', '🔥 *Membres les plus actifs :*', '');
      data.top.forEach((u, i) => lines.push(`${i + 1}. ${u.label} — ${u.count} messages`));
    } else if (data.mode !== 'summary') {
      lines.push('', 'Aucune activité sur cette période.');
    }

    if (data.lastActivityLabel) {
      lines.push('', `🕐 Dernière activité :`, data.lastActivityLabel);
    }

    lines.push('', footer(data.footer));
    return lines.join('\n');
  },

  renderActivityUser(data) {
    const lines = [
      boxTop(19, BOX),
      `   📊 *ACTIVITÉ DE ${data.userLabel}*`,
      boxBottom(19, BOX),
      '',
      `💬 Messages : ${data.total}`,
      '',
      `📅 Aujourd'hui : ${data.today}`,
      `📅 Cette semaine : ${data.week}`,
      `📆 Ce mois : ${data.month}`,
      '',
      `🕐 Dernière activité :`,
      data.lastActivityLabel,
      '',
      footer(data.footer),
    ];
    return lines.join('\n');
  },

  renderInactive(data) {
    const lines = [boxTop(19, BOX), `   👻 *MEMBRES INACTIFS*`, boxBottom(19, BOX), ''];

    lines.push(`Aucune activité depuis ${data.minDaysLabel} :`, '');
    if (!data.inactive.length) {
      lines.push('Aucun membre inactif sur cette période. 🎉');
    } else {
      for (const m of data.inactive) lines.push(`• ${m.label}`);
    }

    if (data.unknownCount > 0) {
      lines.push(
        '',
        `ℹ️ ${data.unknownCount} membre(s) sans donnée d'activité connue (non pris en compte ci-dessus).`
      );
    }

    lines.push('', footer(data.footer));
    return lines.join('\n');
  },

  renderStats(data) {
    const lines = [
      boxTop(19, BOX),
      `   📊 *STATISTIQUES*`,
      boxBottom(19, BOX),
      '',
      `⏱ Uptime : ${data.uptime}`,
      `💬 Messages traités : ${data.messages}`,
      `📊 Commandes exécutées : ${data.totalCommands}`,
      `📋 Commandes uniques : ${data.uniqueCommands}`,
      `🔒 Mode : ${data.mode}`,
      `🆔 Instance : ${data.instanceId}`,
      `👤 Propriétaire : ${data.instanceOwner}`,
      '',
    ];

    if (data.topCommands.length) {
      lines.push('🏆 *Commandes les plus utilisées :*', '');
      data.topCommands.forEach((cmd, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        lines.push(`${medal} ${cmd.name} — ${cmd.count} exécution(s)`);
      });
    } else {
      lines.push('Aucune commande exécutée pour le moment.');
    }

    lines.push('', footer(data.footer));
    return lines.join('\n');
  },
};