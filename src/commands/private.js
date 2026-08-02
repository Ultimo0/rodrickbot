import { isLockdownMode, setLockdownMode } from '../core/state.js';

export default {
  name: 'private',
  description: 'Active/désactive le mode privé strict (bot utilisable uniquement par l\'admin). Usage: !private on|off|status',
  adminOnly: true,
  privateOnly: false, // l'admin doit pouvoir basculer ce mode même depuis un groupe
  category: 'Administration',
  execute: async (ctx) => {
    const arg = (ctx.args[0] || '').toLowerCase();

    if (arg === 'on') {
      setLockdownMode(true);
      await ctx.success('Mode privé strict activé. Seul l\'admin peut désormais utiliser le bot.');
      return;
    }

    if (arg === 'off') {
      setLockdownMode(false);
      await ctx.success('Mode privé strict désactivé. Le bot répond de nouveau normalement.');
      return;
    }

    if (arg === 'status') {
      await ctx.success(`Mode privé strict: ${isLockdownMode() ? 'activé' : 'désactivé'}`);
      return;
    }

    await ctx.error('Usage: !private on | off | status');
  },
};