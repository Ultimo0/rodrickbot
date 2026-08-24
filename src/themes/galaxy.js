/**
 * Thème "Galaxy" : ambiance cosmique et onirique. Contrairement aux
 * autres thèmes, pas de boîte rectangulaire — les titres sont encadrés
 * par une ligne d'étoiles, et la police est la cursive "script" (même
 * famille que le nom du développeur dans settings.json).
 *
 * Sert aussi de preuve concrète d'extensibilité du moteur : ce fichier a
 * été ajouté sans toucher à engine.js ni à aucun autre thème.
 */
import { toScriptFont } from '../utils/fancyFont.js';

const DIVIDER = '✦ ⋆ ｡ ⋆ ✦ ⋆ ｡ ⋆ ✦';
const ACCENT = '🪐';
const script = toScriptFont;

function titleBlock(title) {
  return [DIVIDER, `${ACCENT} ${script(title)}`, DIVIDER].join('\n');
}

function footer({ version, prefix, developerName }) {
  return [DIVIDER, `🌠 Version ${version} · Préfixe ${prefix}`, `   Développeur : ${developerName}`].join('\n');
}

export default {
  name: 'galaxy',
  label: 'Galaxy',

  renderMainMenu(data) {
    const lines = [
      titleBlock(data.botName.toUpperCase()),
      '',
      `🪐 Voyageur : ${data.senderName}`,
      `🌍 Date : ${data.dateStr}`,
      `🌙 Heure : ${data.timeStr}`,
      `🌌 Uptime : ${data.uptime}`,
      `📡 Ping : ${data.ping} ms`,
      `💫 Mémoire : ${data.ramMb} Mo`,
      `🔭 Mode : ${data.mode}`,
      `🛰 Commandes : ${data.commandCount}`,
      `✨ Thème : ${ACCENT} ${data.themeLabel}`,
      '',
      titleBlock('CONSTELLATIONS'),
      '',
    ];

    for (const cat of data.categories) {
      lines.push(`${cat.icon} ${script(cat.label)} · ${cat.count}`);
    }

    lines.push('', '🌠 Explore une galaxie :');
    for (const cat of data.categories) {
      lines.push(`➜ ${data.prefix}menu ${cat.key}`);
    }

    lines.push('', footer(data.footer));
    return lines.join('\n');
  },

  renderCategoryMenu(data) {
    const lines = [titleBlock(data.category.label.toUpperCase()), ''];

    for (const cmd of data.commands) {
      lines.push(`✦ ${data.prefix}${cmd.name}${cmd.tagsSuffix}`);
      lines.push(`   ${cmd.description}`);
      lines.push('');
    }

    if (!data.commands.length) {
      lines.push('Aucune étoile dans cette constellation pour le moment.', '');
    }

    lines.push(`🌠 Retour au menu : ${data.prefix}menu`, '', footer(data.footer));
    return lines.join('\n');
  },

  renderCommandDetail(data) {
    const lines = [titleBlock(`${data.prefix}${data.cmd.name}`), '', `${data.cmd.description}${data.cmd.tagsSuffix}`];

    if (data.cmd.category) lines.push(`Constellation : ${data.cmd.category}`);
    if (data.cmd.aliases.length) lines.push(`Alias : ${data.cmd.aliases.join(', ')}`);
    lines.push('', footer(data.footer));

    return lines.join('\n');
  },

  renderStartup(data) {
    const lines = [titleBlock(data.botName), ''];

    if (data.configured) {
      lines.push('🪐 Statut', '  ✅ En orbite', '');
      lines.push('🛰 Instance', `  ${data.instanceId}`, '');
      lines.push('🌍 Propriétaire', `  ${data.instanceOwner}`);
    } else {
      lines.push('🪐 Statut', '  ⚠️ Hors orbite (non configurée)', '');
      lines.push('🌠 A faire', `  ${data.prefix}setup <identifiant> <propriétaire>`);
    }

    lines.push('', '✨ Commandes chargées', `  ${data.commandCount}`);
    lines.push('', '🌙 Mode', `  ${data.mode}`);
    lines.push(DIVIDER);
    // Marqueur "> " volontairement fixe, non thémé — identité visuelle
    // constante du bot, quel que soit le thème actif.
    lines.push(`> ${script(data.signature)}`);

    return lines.join('\n');
  },

  renderWelcome(data) {
    return [
      titleBlock('NOUVELLE ÉTOILE'),
      '',
      `🪐 @${data.number} vient d'entrer dans l'orbite de *${data.groupName}*.`,
      '',
      '✨ Que ton passage illumine cette galaxie.',
      '🌠 Bienvenue parmi les étoiles !',
    ].join('\n');
  },

  renderBye(data) {
    return [
      titleBlock('ÉTOILE FILANTE'),
      '',
      `🌠 @${data.number} quitte l'orbite de *${data.groupName}*.`,
      '',
      '🌙 Merci pour la lumière que tu as apportée.',
      '✦ Bon vent parmi les étoiles ✦',
    ].join('\n');
  },

  renderDeletedMessages(data) {
    const lines = [titleBlock('ÉTOILES ÉTEINTES'), ''];

    if (!data.entries.length) {
      lines.push('🌑 Aucune étoile éteinte récemment dans cette galaxie.');
    } else {
      for (const e of data.entries) {
        lines.push(`${e.icon} ${script(`#${e.index} ${e.typeLabel}`)}`);
        lines.push(`   🪐 Éteinte par : ${e.authorLabel}`);
        lines.push(`   🌙 ${e.whenLabel}`);
        if (e.textContent) lines.push(`   ✨ ${e.textContent}`);
        lines.push('');
      }
    }

    lines.push(footer(data.footer));
    return lines.join('\n');
  },

  renderActivityGroup(data) {
    const lines = [titleBlock('CONSTELLATION DU GROUPE'), ''];

    if (data.mode === 'summary') {
      lines.push(`🪐 Membres de la galaxie : ${data.memberCount}`);
      lines.push(`🌠 Messages aujourd'hui : ${data.today}`);
      lines.push(`🌙 Cette semaine : ${data.week}`);
      lines.push(`✨ Ce mois : ${data.month}`);
    } else if (data.mode === 'period') {
      lines.push(`🌠 ${script(data.periodLabel)} : ${data.periodCount} messages`);
    } else if (data.mode === 'top') {
      lines.push(`🪐 ${script('Étoiles les plus brillantes')} · ${data.periodLabel}`);
    }

    if (data.top.length) {
      lines.push('', `✦ ${script('Étoiles les plus brillantes')} ✦`, '');
      data.top.forEach((u, i) => lines.push(`${i + 1}. ${u.label} — ${u.count} messages ✨`));
    } else if (data.mode !== 'summary') {
      lines.push('', '🌑 Aucune lumière détectée sur cette période.');
    }

    if (data.lastActivityLabel) {
      lines.push('', `🌙 Dernière lueur d'activité :`, `   ${data.lastActivityLabel}`);
    }

    lines.push('', footer(data.footer));
    return lines.join('\n');
  },

  renderActivityUser(data) {
    const lines = [
      titleBlock(`ORBITE DE ${data.userLabel}`),
      '',
      `🌠 Messages : ${data.total}`,
      '',
      `✨ Aujourd'hui : ${data.today}`,
      `🌙 Cette semaine : ${data.week}`,
      `🪐 Ce mois : ${data.month}`,
      '',
      `🌙 Dernière lueur d'activité :`,
      `   ${data.lastActivityLabel}`,
      '',
      footer(data.footer),
    ];
    return lines.join('\n');
  },

  renderInactive(data) {
    const lines = [titleBlock('ÉTOILES ENDORMIES'), ''];

    lines.push(`🌑 Aucune lumière depuis ${data.minDaysLabel} :`, '');
    if (!data.inactive.length) {
      lines.push('✦ Toute la galaxie brille encore ✦');
    } else {
      for (const m of data.inactive) lines.push(`💤 ${m.label}`);
    }

    if (data.unknownCount > 0) {
      lines.push('', `🌫️ ${data.unknownCount} étoile(s) sans lumière connue (non comptée ci-dessus).`);
    }

    lines.push('', footer(data.footer));
    return lines.join('\n');
  },

  renderStats(data) {
    const lines = [
      titleBlock('STATISTIQUES'),
      '',
      `🪐 Uptime : ${data.uptime}`,
      `🌠 Messages traités : ${data.messages}`,
      `✨ Commandes exécutées : ${data.totalCommands}`,
      `📋 Commandes uniques : ${data.uniqueCommands}`,
      `🔭 Mode : ${data.mode}`,
      `🛰 Instance : ${data.instanceId}`,
      `🌍 Propriétaire : ${data.instanceOwner}`,
      '',
    ];

    if (data.topCommands.length) {
      lines.push(`✦ ${script('Top commandes')} ✦`, '');
      data.topCommands.forEach((cmd, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        lines.push(`${medal} ${script(cmd.name)} — ${cmd.count} étoiles ✨`);
      });
    } else {
      lines.push('🌑 Aucune étoile n\'a encore brillé.');
    }

    lines.push('', footer(data.footer));
    return lines.join('\n');
  },
}; 