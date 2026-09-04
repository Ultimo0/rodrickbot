import path from 'path';
import { mkdirSync } from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');

// Créé une seule fois, à l'import de ce module — donc avant toute
// lecture/écriture d'un fichier de données. Idempotent (récursif) si le
// dossier existe déjà, ce qui est le cas normal en déploiement (data/
// contient déjà cookies.txt, utilisé par yt-dlp).
mkdirSync(DATA_DIR, { recursive: true });

/**
 * Chemin absolu d'un fichier de données runtime (state, sessions,
 * statistiques...), regroupé dans data/ plutôt qu'à la racine du projet.
 * Ne concerne QUE les fichiers écrits/lus au runtime — pas les assets
 * versionnés embarqués dans le code (ex: src/data/quizQuestions.json,
 * qui reste où il est : un chemin de code, pas une donnée d'exécution).
 */
export function dataFilePath(filename) {
  return path.join(DATA_DIR, filename);
}
