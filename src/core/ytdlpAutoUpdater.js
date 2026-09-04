import { createRequire } from 'node:module';
import { logger } from '../utils/logger.js';

const require = createRequire(import.meta.url);
const { ensureYtDlpBinary } = require('../../fix-ytdlp.cjs');

/**
 * fix-ytdlp.cjs re-télécharge déjà systématiquement la DERNIÈRE release
 * yt-dlp à chaque démarrage du bot (voir boot.mjs) — mais un bot stable qui
 * tourne en continu pendant des semaines (l'objectif même de tout le
 * travail de stabilité fait par ailleurs) ne redémarre justement quasiment
 * jamais. Résultat : le binaire pouvait rester figé sur une version vieille
 * de plusieurs semaines, alors que TikTok/YouTube cassent régulièrement
 * leurs pages et que yt-dlp publie des correctifs en quelques jours.
 *
 * Ce module comble cet écart : un rafraîchissement automatique en tâche de
 * fond, sans jamais avoir besoin de redémarrer le bot ni d'intervenir à la
 * main sur le serveur.
 */
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h — yt-dlp publie rarement plus d'une fois par jour

export function initYtDlpAutoUpdater() {
  const interval = setInterval(async () => {
    try {
      await ensureYtDlpBinary();
      logger.info('[YtDlpAutoUpdater] Binaire yt-dlp rafraîchi (vérification quotidienne).');
    } catch (err) {
      // Non bloquant : si GitHub est temporairement injoignable, le binaire
      // actuel continue de fonctionner tel quel jusqu'au prochain essai.
      logger.warn({ err }, '[YtDlpAutoUpdater] Rafraîchissement échoué, nouvel essai dans 24h.');
    }
  }, REFRESH_INTERVAL_MS);
  interval.unref?.(); // ne doit jamais empêcher le process de s'arrêter proprement

  logger.info('[YtDlpAutoUpdater] Rafraîchissement automatique du binaire yt-dlp activé (toutes les 24h).');
}
