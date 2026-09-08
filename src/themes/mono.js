/**
 * Thème "Mono" : ultra minimaliste, aspect console/texte brut. Tout le
 * message est encapsulé dans un bloc de code WhatsApp (```) pour un vrai
 * rendu monospace natif — pas de police Unicode ni de boîte dessinée,
 * quasiment aucun emoji. Compact, rapide à lire.
 */
import { pickRandom } from '../utils/pickRandom.js';

const SEP = '-------------------';

function pad(label, width = 14) {
  return label.padEnd(width, ' ');
}

/** Encapsule le contenu dans un bloc de code WhatsApp (rendu monospace natif). */
function block(lines) {
  return '```\n' + lines.join('\n') + '\n```';
}

function footer({ version, prefix, developerName }) {
  return [SEP, `v${version} | prefix ${prefix} | ${developerName}`].join('\n');
}

export default {
  name: 'mono',
  label: 'Mono',

  renderMainMenu(data) {
    const lines = [
      data.botName.toUpperCase(),
      SEP,
      `${pad('user')}${data.senderName}`,
      `${pad('date')}${data.dateStr} ${data.timeStr}`,
      `${pad('uptime')}${data.uptime}`,
      `${pad('ping')}${data.ping}ms`,
      `${pad('ram')}${data.ramMb}Mo`,
      `${pad('mode')}${data.mode.toLowerCase()}`,
      `${pad('commands')}${data.commandCount}`,
      `${pad('theme')}${data.themeLabel.toLowerCase()}`,
      SEP,
      'categories',
    ];

    for (const cat of data.categories) {
      lines.push(`${pad(cat.key, 16)}${cat.count}`);
    }

    lines.push(SEP, `> ${data.prefix}menu <categorie>`, '', footer(data.footer));
    return block(lines);
  },

  renderCategoryMenu(data) {
    const lines = [data.category.label.toLowerCase(), SEP];

    for (const cmd of data.commands) {
      lines.push(`${data.prefix}${cmd.name}${cmd.tagsSuffix}`);
      lines.push(`  ${cmd.description}`);
    }

    if (!data.commands.length) {
      lines.push('(aucune commande dans cette categorie)');
    }

    lines.push(SEP, `retour: ${data.prefix}menu`, '', footer(data.footer));
    return block(lines);
  },

  renderCommandDetail(data) {
    const lines = [`${data.prefix}${data.cmd.name}`, SEP, `${data.cmd.description}${data.cmd.tagsSuffix}`];

    if (data.cmd.category) lines.push(`category: ${data.cmd.category}`);
    if (data.cmd.aliases.length) lines.push(`aliases: ${data.cmd.aliases.join(', ')}`);
    lines.push(footer(data.footer));

    return block(lines);
  },

  renderStartup(data) {
    const lines = [data.botName, SEP];

    if (data.configured) {
      lines.push(`${pad('status')}ok`);
      lines.push(`${pad('instance')}${data.instanceId}`);
      lines.push(`${pad('owner')}${data.instanceOwner}`);
    } else {
      lines.push(`${pad('status')}unconfigured`);
      lines.push(`${pad('todo')}${data.prefix}setup <identifiant> <propriétaire>`);
    }

    lines.push(`${pad('commands')}${data.commandCount}`);
    lines.push(`${pad('mode')}${data.mode.toLowerCase()}`);
    lines.push(SEP);
    // Marqueur "> " volontairement fixe, non thémé — identité visuelle
    // constante du bot, quel que soit le thème actif.
    lines.push(`> ${data.signature}`);

    return block(lines);
  },

  renderWelcome(data) {
    const line = pickRandom([
      `+ @${data.number} a rejoint ${data.groupName}`,
      `+ @${data.number} vient d'atterrir dans ${data.groupName}`,
      `+ nouveau: @${data.number} dans ${data.groupName}`,
    ]);
    return block([line]);
  },

  renderBye(data) {
    return block([`- @${data.number} a quitte ${data.groupName}`]);
  },

  renderDeletedMessages(data) {
    const lines = ['messages supprimes', SEP];

    if (!data.entries.length) {
      lines.push('(aucun message supprime recemment)');
    } else {
      for (const e of data.entries) {
        lines.push(`#${e.index} ${e.typeLabel.toLowerCase()} - ${e.authorLabel} - ${e.whenLabel}`);
        if (e.textContent) lines.push(`  ${e.textContent}`);
      }
    }

    lines.push(SEP, footer(data.footer));
    return block(lines);
  },

  renderActivityGroup(data) {
    const lines = ['activite du groupe', SEP];

    if (data.mode === 'summary') {
      lines.push(`${pad('membres')}${data.memberCount}`);
      lines.push(`${pad("aujourd'hui")}${data.today} msg`);
      lines.push(`${pad('semaine')}${data.week} msg`);
      lines.push(`${pad('mois')}${data.month} msg`);
    } else if (data.mode === 'period') {
      lines.push(`${pad(data.periodLabel.toLowerCase())}${data.periodCount} msg`);
    } else if (data.mode === 'top') {
      lines.push(`top membres - ${data.periodLabel.toLowerCase()}`);
    }

    if (data.top.length) {
      lines.push(SEP, 'classement');
      data.top.forEach((u, i) => lines.push(`${i + 1}. ${u.label} - ${u.count} msg`));
    } else if (data.mode !== 'summary') {
      lines.push('(aucune activite sur cette periode)');
    }

    if (data.lastActivityLabel) {
      lines.push(SEP, `${pad('derniere activite')}${data.lastActivityLabel}`);
    }

    lines.push(SEP, footer(data.footer));
    return block(lines);
  },

  renderActivityUser(data) {
    const lines = [
      `activite de ${data.userLabel}`,
      SEP,
      `${pad('messages')}${data.total}`,
      SEP,
      `${pad("aujourd'hui")}${data.today}`,
      `${pad('semaine')}${data.week}`,
      `${pad('mois')}${data.month}`,
      SEP,
      `${pad('derniere activite')}${data.lastActivityLabel}`,
      SEP,
      footer(data.footer),
    ];
    return block(lines);
  },

  renderInactive(data) {
    const lines = ['membres inactifs', SEP, `aucune activite depuis ${data.minDaysLabel} :`, SEP];

    if (!data.inactive.length) {
      lines.push('(aucun membre inactif)');
    } else {
      for (const m of data.inactive) lines.push(`- ${m.label}`);
    }

    if (data.unknownCount > 0) {
      lines.push(SEP, `${data.unknownCount} membre(s) sans donnee connue (ignore)`);
    }

    lines.push(SEP, footer(data.footer));
    return block(lines);
  },

  renderStats(data) {
    const lines = [
      'statistiques',
      SEP,
      `${pad('uptime')}${data.uptime}`,
      `${pad('messages')}${data.messages}`,
      `${pad('commands')}${data.totalCommands}`,
      `${pad('unique_cmds')}${data.uniqueCommands}`,
      `${pad('mode')}${data.mode.toLowerCase()}`,
      `${pad('instance')}${data.instanceId}`,
      `${pad('owner')}${data.instanceOwner}`,
      SEP,
    ];

    if (data.topCommands.length) {
      lines.push('top commands');
      data.topCommands.forEach((cmd, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        lines.push(`${medal} ${cmd.name} - ${cmd.count}`);
      });
    } else {
      lines.push('(aucune commande executee)');
    }

    lines.push(SEP, footer(data.footer));
    return block(lines);
  },
};