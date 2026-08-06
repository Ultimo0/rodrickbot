import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { logger } from './logger.js';

/**
 * Helpers partagés par les magasins JSON persistants (state, warnings,
 * group_settings, saved_items, lock_schedules, instance).
 *
 * Lecture: une erreur n'est jamais fatale — on repart des valeurs par
 * défaut et on trace l'incident.
 *
 * Écriture: une erreur EST fatale pour l'appelant. Un échec d'écriture
 * signifie que la modification n'existe que en mémoire et sera perdue au
 * prochain redémarrage; l'erreur est donc remontée pour que la commande
 * appelante réponde par un échec au lieu d'annoncer un faux succès.
 */

export function readJsonFile(filePath, fallback, label) {
  if (!existsSync(filePath)) return fallback;

  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    logger.warn({ err, filePath }, `Impossible de lire ${label}, valeurs par défaut utilisées`);
    return fallback;
  }
}

/** Écrit le fichier de façon atomique. Lève une erreur explicite en cas d'échec. */
export function writeJsonFile(filePath, data, label) {
  const tmpPath = `${filePath}.tmp`;

  try {
    writeFileSync(tmpPath, JSON.stringify(data, null, 2));
    renameSync(tmpPath, filePath);
  } catch (err) {
    logger.error({ err, filePath }, `Impossible d'écrire ${label}`);
    throw new Error(`écriture de ${label} impossible : ${err.message}`, { cause: err });
  }
}
