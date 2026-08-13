import { startGame, abandonGame, getStatsMessage, getLeaderboardMessage, purgeEverything } from '../core/calc/CalcEngine.js';
import { hasActiveSession as hasActiveQuizSession } from '../core/quiz/QuizEngine.js';

const DIFFICULTIES = ['facile', 'moyen', 'difficile'];

const START_FAILURE_MESSAGES = {
  ACTIVE_SESSION: '❌ Tu as déjà une partie de calcul mental en cours. Réponds à l\'opération en attente, ou tape /calcul abandonner.',
  QUIZ_ACTIVE: '❌ Termine ou abandonne (/quiz abandonner) ton quiz en cours avant de lancer un calcul mental.',
};

async function handleStart(ctx, difficulty) {
  if (hasActiveQuizSession(ctx.sender)) {
    await ctx.error(START_FAILURE_MESSAGES.QUIZ_ACTIVE);
    return;
  }
  const result = await startGame(ctx.sock, { chatId: ctx.chatId, sender: ctx.sender, difficulty });
  if (!result.ok) {
    await ctx.error(START_FAILURE_MESSAGES[result.reason] || '❌ Impossible de démarrer la partie.');
  }
}

export default {
  name: 'calcul',
  description:
    'Calcul mental rapide (réponds par un nombre). Usage : {prefix}calcul [facile|moyen|difficile] — ' +
    '{prefix}calcul stats — {prefix}calcul classement — {prefix}calcul abandonner — {prefix}calcul purge (admin)',
  category: 'Jeux',
  privateOnly: false,
  execute: async (ctx) => {
    const first = ctx.args[0]?.toLowerCase();

    switch (first) {
      case undefined:
        await handleStart(ctx, undefined);
        return;

      case 'stats': {
        await ctx.reply(getStatsMessage(ctx.sender));
        return;
      }

      case 'classement':
      case 'leaderboard': {
        await ctx.reply(getLeaderboardMessage(ctx.sender));
        return;
      }

      case 'abandonner':
      case 'abandon': {
        const session = await abandonGame(ctx.sender);
        if (!session) {
          await ctx.error("❌ Tu n'as aucune partie de calcul mental en cours.");
          return;
        }
        await ctx.success(`🚪 Partie abandonnée (${session.correctCount}/${session.currentIndex} bonnes réponses avant l'abandon).`);
        return;
      }

      case 'purge': {
        if (!ctx.isAdmin) {
          await ctx.error('Commande réservée aux administrateurs.');
          return;
        }
        await ctx.processing();
        const result = await purgeEverything(ctx.sock);
        await ctx.success(
          '🗑️ Réinitialisation complète du module Calcul mental effectuée :\n' +
          `• ${result.sessionsCleared} partie(s) active(s) interrompue(s)\n` +
          `• calc_sessions.json vidé (${result.sessionsPurged} session(s) supprimée(s))\n` +
          `• calc_stats.json vidé (${result.profilesDeleted} profil(s) supprimé(s))`
        );
        return;
      }

      default: {
        if (!DIFFICULTIES.includes(first)) {
          await ctx.error(`❌ Difficulté inconnue : "${first}". Choisis parmi : ${DIFFICULTIES.join(', ')}.`);
          return;
        }
        await handleStart(ctx, first);
      }
    }
  },
};
