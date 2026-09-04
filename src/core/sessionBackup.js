/**
 * Protection contre la corruption du dossier de session Baileys
 * (auth_info/). On ne peut pas rendre les écritures de Baileys lui-même
 * atomiques sans le modifier (fs.writeFile interne, hors de notre
 * contrôle), donc l'approche ici est différente : on garde régulièrement
 * des snapshots valides du dossier de session, et si jamais le dossier
 * actuel s'avère absent ou corrompu au démarrage, on restaure
 * automatiquement le dernier snapshot connu pour être bon — plutôt que de
 * forcer un nouveau scan de QR code / pairing à chaque incident.
 */

import { existsSync, mkdirSync, readdirSync, statSync, cpSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const AUTH_DIR = path.isAbsolute(config.authFolder)
  ? config.authFolder
  : path.join(process.cwd(), config.authFolder);
const BACKUP_ROOT = path.join(process.cwd(), 'auth_info_backups');
const MAX_BACKUPS = 5;

/** Un creds.json valide = present, JSON parsable, et contient bien un champ attendu. */
function isCredsValid(dir) {
  const credsPath = path.join(dir, 'creds.json');
  if (!existsSync(credsPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(credsPath, 'utf-8'));
    return !!parsed && typeof parsed === 'object' && 'registered' in parsed;
  } catch {
    return false;
  }
}

function pruneOldBackups() {
  if (!existsSync(BACKUP_ROOT)) return;
  const entries = readdirSync(BACKUP_ROOT)
    .map((name) => ({ name, full: path.join(BACKUP_ROOT, name) }))
    .filter((e) => {
      try {
        return statSync(e.full).isDirectory();
      } catch {
        return false;
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name)); // noms horodatés ISO -> ordre chronologique

  const excess = entries.length - MAX_BACKUPS;
  for (let i = 0; i < excess; i += 1) {
    rmSync(entries[i].full, { recursive: true, force: true });
  }
}

/**
 * Sauvegarde le dossier de session actuel dans un snapshot horodaté, mais
 * SEULEMENT s'il est valide — jamais la peine de sauvegarder un état déjà
 * cassé. À appeler après chaque connexion réussie (c'est le seul moment
 * où on est certain à 100% que la session sur disque fonctionne, puisqu'
 * elle vient de servir à se connecter) et périodiquement pendant que la
 * connexion reste ouverte (les clés Signal tournent avec le temps).
 */
export function backupSessionIfValid() {
  try {
    if (!isCredsValid(AUTH_DIR)) return;

    mkdirSync(BACKUP_ROOT, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(BACKUP_ROOT, stamp);
    cpSync(AUTH_DIR, dest, { recursive: true });

    pruneOldBackups();
    logger.info(`Sauvegarde de session créée (${dest}).`);
  } catch (err) {
    logger.error({ err }, 'Échec de la sauvegarde de session.');
  }
}

/**
 * Si le dossier de session actuel est absent, vide, ou corrompu, restaure
 * automatiquement le snapshot valide le plus récent AVANT que Baileys
 * n'essaie de s'en servir pour se connecter. Retourne true si une
 * restauration a eu lieu (utile pour le log côté appelant).
 */
export function restoreSessionIfCorrupted() {
  if (isCredsValid(AUTH_DIR)) return false; // session actuelle déjà bonne, rien à faire

  if (!existsSync(BACKUP_ROOT)) return false;

  const candidates = readdirSync(BACKUP_ROOT)
    .map((name) => path.join(BACKUP_ROOT, name))
    .filter((full) => {
      try {
        return statSync(full).isDirectory();
      } catch {
        return false;
      }
    })
    .sort()
    .reverse(); // le plus récent en premier

  for (const candidate of candidates) {
    if (isCredsValid(candidate)) {
      logger.warn(
        `Session actuelle absente ou corrompue — restauration automatique depuis la sauvegarde ${candidate}.`
      );
      try {
        rmSync(AUTH_DIR, { recursive: true, force: true });
        cpSync(candidate, AUTH_DIR, { recursive: true });
        return true;
      } catch (err) {
        logger.error({ err }, `Échec de la restauration depuis ${candidate}, essai du snapshot précédent.`);
        continue;
      }
    }
  }

  logger.warn('Aucune sauvegarde de session valide trouvée à restaurer.');
  return false;
}
