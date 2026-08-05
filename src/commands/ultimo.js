import {
  enableAgentForSession,
  disableAgentForSession,
  isAgentSessionEnabled,
  clearSession,
  getSession,
} from '../agent/index.js';

export default {
  name: 'ultimo',
  aliases: ['assistant', 'botia', 'agent'],
  description:
    'Active/désactive le mode Agent IA conversationnel pour ce chat. Usage: /ultimo on|off|status|clear',
  category: 'Intelligence Artificielle',
  adminOnly: false,
  privateOnly: false,
  execute: async (ctx) => {
    const [mode = 'status'] = ctx.args;
    const normalized = mode.toLowerCase();

    if (normalized === 'on') {
      enableAgentForSession(ctx.chatId, ctx.sender);
      await ctx.success('Mode Agent IA activé pour ce chat. Vous pouvez désormais converser librement avec RodrickBOT.');
      return;
    }

    if (normalized === 'off') {
      disableAgentForSession(ctx.chatId, ctx.sender);
      await ctx.success('Mode Agent IA désactivé pour ce chat.');
      return;
    }

    if (normalized === 'clear') {
      clearSession(ctx.chatId, ctx.sender);
      await ctx.success('Mémoire de session réinitialisée pour ce chat.');
      return;
    }

    const session = getSession(ctx.chatId, ctx.sender);
    const enabled = isAgentSessionEnabled(ctx.chatId, ctx.sender);
    const statusText = [
      `État du mode Agent IA : ${enabled ? 'activé' : 'désactivé'}`,
      session ? `Messages enregistrés : ${session.messages.length}` : 'Aucune session active.',
      'Usage : /ultimo on | /ultimo off | /ultimo status | /ultimo clear',
    ].join('\n');

    await ctx.reply({ text: statusText });
  },
};
