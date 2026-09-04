import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

// ~150-300 Mo à télécharger la première fois — largement le temps qu'il
// faut prévoir sur une connexion modeste.
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Équivalent de fix-ytdlp.cjs/ensureYtDlpBinary, mais pour le Chromium dont
 * a besoin le repli navigateur de !tiktok (voir utils/tiktokBrowser.js).
 * Vérifie si le binaire existe déjà au chemin attendu par Playwright ; si
 * absent, le télécharge automatiquement — plus besoin de lancer
 * `npx playwright install chromium` à la main après un déploiement.
 *
 * Volontairement SANS --with-deps ici : cette option installe des
 * librairies système via apt-get, ce qui nécessite les droits root/sudo.
 * Lancer un apt-get automatiquement depuis le processus du bot (souvent
 * exécuté par un utilisateur non-root sous systemd) est risqué et peut
 * silencieusement échouer ou rester bloqué sur une demande de mot de
 * passe. Le téléchargement du binaire Chromium lui-même (fait ici) ne
 * nécessite lui aucun droit particulier. Si des librairies système
 * manquent malgré tout, ça se voit au premier lancement réel (voir le
 * message d'erreur clair renvoyé par utils/tiktokBrowser.js) et se
 * corrige en une seule commande, une seule fois.
 */
export async function ensureChromiumInstalled() {
  if (config.disableTiktokBrowserFallback) {
    logger.debug('[ChromiumInstaller] Désactivé via DISABLE_TIKTOK_BROWSER_FALLBACK, rien à faire.');
    return;
  }

  let expectedPath;
  try {
    expectedPath = chromium.executablePath();
  } catch (err) {
    logger.warn({ err }, '[ChromiumInstaller] Impossible de déterminer le chemin attendu de Chromium.');
    return;
  }

  if (expectedPath && existsSync(expectedPath)) {
    logger.debug('[ChromiumInstaller] Chromium déjà présent, rien à faire.');
    return;
  }

  logger.info(
    '[ChromiumInstaller] Chromium absent (nécessaire pour le repli !tiktok) — téléchargement automatique en cours (~150-300 Mo, peut prendre plusieurs minutes)...'
  );

  try {
    await execFileAsync('npx', ['--yes', 'playwright', 'install', 'chromium'], {
      timeout: INSTALL_TIMEOUT_MS,
    });
    logger.info('[ChromiumInstaller] ✅ Chromium installé avec succès.');
  } catch (err) {
    // Non bloquant : le bot continue de fonctionner normalement, seul le
    // repli navigateur de !tiktok restera indisponible tant que ce n'est
    // pas résolu (réessayé automatiquement au prochain redémarrage).
    logger.error(
      { err },
      "[ChromiumInstaller] Échec du téléchargement automatique — le repli navigateur de !tiktok restera indisponible. " +
        'Réessai automatique au prochain redémarrage du bot, ou lance `npx playwright install chromium --with-deps` à la main.'
    );
  }
}
