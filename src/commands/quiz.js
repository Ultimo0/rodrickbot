import {
  startQuiz,
  abandonQuiz,
  getStatsMessage,
  getLeaderboardMessage,
  getCategoriesMessage,
  hasActiveSession,
  listActiveSessions,
  forceEndSession,
  forceEndAllSessions,
  purgeAllSessionData,
  purgeEverything,
} from '../core/quiz/QuizEngine.js';
import { requestReset, requestGlobalReset } from '../core/quiz/QuizResetService.js';
import { listCategories, reloadQuestions } from '../core/quiz/QuizLoader.js';
import { renderSessionsList } from '../core/quiz/QuizRenderer.js';
import { resolveTargetJids, normalizeJid } from '../utils/groupTarget.js';

const DIFFICULTIES = ['facile', 'moyen', 'difficile'];

const START_FAILURE_MESSAGES = {
  ACTIVE_SESSION:
    '❌ Tu as déjà un quiz en cours. Réponds à la question en attente, ou tape /quiz abandonner pour y renoncer.',
  NO_QUESTIONS_AT_ALL: "❌ Aucune question n'est disponible pour le moment.",
  NO_QUESTIONS_MATCH: '❌ Aucune question ne correspond à cette catégorie/difficulté. Tape /quiz categories pour voir les options.',
};

async function handleStart(ctx, { category, difficulty } = {}) {
  const result = await startQuiz(ctx.sock, { chatId: ctx.chatId, sender: ctx.sender, category, difficulty });
  if (!result.ok) {
    await ctx.error(START_FAILURE_MESSAGES[result.reason] || '❌ Impossible de démarrer le quiz.');
  }
}

export default {
  name: 'quiz',
  description:
    'Quiz interactif (réponds par chiffre). Usage : {prefix}quiz [categorie] [difficulte] — {prefix}quiz random — ' +
    '{prefix}quiz stats — {prefix}quiz classement — {prefix}quiz abandonner — {prefix}quiz reset' +
    ' — {prefix}quiz sessions [clear [@mention|numero]|purge] (admin) — {prefix}quiz resetall (admin) — ' +
    '{prefix}quiz refresh (admin) — {prefix}quiz purge (admin, vide cache+sessions+stats)',
  category: 'Jeux',
  privateOnly: false,
  execute: async (ctx) => {
    const [first, second] = ctx.args.map((a) => a?.toLowerCase());

    switch (first) {
      case undefined:
      case 'random':
        await handleStart(ctx);
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
        const session = await abandonQuiz(ctx.sender);
        if (!session) {
          await ctx.error("❌ Tu n'as aucun quiz en cours.");
          return;
        }
        await ctx.success(`🚪 Quiz abandonné (${session.correctCount}/${session.questionIds.length} bonnes réponses avant l'abandon).`);
        return;
      }

      case 'reset': {
        if (hasActiveSession(ctx.sender)) {
          await ctx.error('❌ Termine ou abandonne (/quiz abandonner) ton quiz en cours avant de réinitialiser.');
          return;
        }
        const confirmation = requestReset(ctx.sender, ctx.chatId);
        await ctx.sock.sendMessage(ctx.chatId, confirmation);
        return;
      }

      case 'resetall': {
        if (!ctx.isAdmin) {
          await ctx.error('Commande réservée aux administrateurs.');
          return;
        }
        if (hasActiveSession(ctx.sender)) {
          await ctx.error('❌ Termine ou abandonne (/quiz abandonner) ton propre quiz en cours avant de lancer un reset global.');
          return;
        }
        const confirmation = requestGlobalReset(ctx.sender, ctx.chatId);
        await ctx.sock.sendMessage(ctx.chatId, confirmation);
        return;
      }

      case 'categories':
      case 'categorie': {
        await ctx.reply(getCategoriesMessage());
        return;
      }

      case 'refresh': {
        if (!ctx.isAdmin) {
          await ctx.error('Commande réservée aux administrateurs.');
          return;
        }
        await ctx.processing();
        try {
          const status = await reloadQuestions();
          await ctx.success(`✅ ${status.count} questions à jour, sur ${status.categories} catégorie(s) (source: internet).`);
        } catch (err) {
          await ctx.error("❌ Échec de la récupération depuis Internet — la banque de questions précédente reste active.");
        }
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
          '🗑️ Réinitialisation complète du module Quiz effectuée :\n' +
          `• ${result.sessionsCleared} session(s) active(s) interrompue(s)\n` +
          `• quiz_sessions.json vidé (${result.sessionsPurged} session(s) supprimée(s))\n` +
          `• quiz_stats.json vidé (${result.profilesDeleted} profil(s) supprimé(s))\n` +
          `• quiz_questions_cache.json ${result.cachePurged ? 'supprimé' : '(déjà absent)'}, banque de secours locale active`
        );
        return;
      }

      case 'sessions': {
        if (!ctx.isAdmin) {
          await ctx.error('Commande réservée aux administrateurs.');
          return;
        }

        if (second === 'purge') {
          const count = await purgeAllSessionData(ctx.sock);
          await ctx.success(`🗑️ quiz_sessions.json vidé intégralement (${count} session(s) supprimée(s), actives comprises).`);
          return;
        }

        if (second !== 'clear') {
          await ctx.reply(renderSessionsList(listActiveSessions()));
          return;
        }

        const targets = resolveTargetJids(ctx).map(normalizeJid);
        if (targets.length) {
          let cleared = 0;
          for (const jid of targets) {
            const session = await forceEndSession(ctx.sock, jid);
            if (session) cleared += 1;
          }
          if (cleared === 0) {
            await ctx.error('❌ Aucune session active trouvée pour ce(s) numéro(s).');
          } else {
            await ctx.success(`🗑️ ${cleared} session(s) quiz interrompue(s).`);
          }
          return;
        }

        const count = await forceEndAllSessions(ctx.sock);
        await ctx.success(`🗑️ ${count} session(s) quiz active(s) interrompue(s) (toutes).`);
        return;
      }

      default: {
        // "/quiz <categorie> [difficulte]"
        const categories = listCategories();
        if (!categories.includes(first)) {
          await ctx.error(`❌ Catégorie inconnue : "${first}". Tape /quiz categories pour la liste.`);
          return;
        }
        const difficulty = DIFFICULTIES.includes(second) ? second : undefined;
        await handleStart(ctx, { category: first, difficulty });
      }
    }
  },
};
