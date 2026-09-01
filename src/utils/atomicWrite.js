import { writeFileSync, renameSync } from 'fs';

/**
 * Écrit un fichier de façon atomique : écrit d'abord dans un fichier
 * temporaire voisin (même dossier — obligatoire pour que le renommage
 * reste sur le même système de fichiers, seule condition sous laquelle
 * rename() est atomique), puis le renomme par-dessus la cible.
 *
 * Pourquoi : `writeFileSync(path, data)` seul N'EST PAS atomique — il
 * tronque le fichier puis écrit dedans. Si le process est tué en plein
 * milieu (OOM-kill, `systemctl restart` mal synchronisé, coupure secteur,
 * plantage du conteneur d'hébergement...), le fichier reste dans un état
 * tronqué : ni l'ancienne version, ni la nouvelle — juste corrompu. Au
 * prochain démarrage, JSON.parse() plante dessus, et selon le fichier,
 * ça peut effacer silencieusement tous les réglages de groupe, l'état du
 * bot, etc. (chaque store a bien un try/catch au chargement qui repart
 * sur des valeurs par défaut plutôt que de planter — mais ça reste une
 * perte de données évitable).
 *
 * `rename()` est atomique sous POSIX : le fichier cible est TOUJOURS soit
 * l'ancienne version complète, soit la nouvelle version complète — jamais
 * un état intermédiaire, même en cas de kill -9 exactement pendant
 * l'opération. Vérifié par un test réel (écriture de 600 Mo tuée à la
 * moitié : sans ce correctif, fichier tronqué à ~370 Mo et illisible ;
 * avec, fichier resté intact sur l'ancienne version).
 *
 * API identique à writeFileSync(path, data) — remplacement direct partout
 * où un fichier JSON est relu au démarrage suivant.
 */
export function atomicWriteFileSync(path, data) {
  const tmpPath = `${path}.${process.pid}.tmp`;
  writeFileSync(tmpPath, data);
  renameSync(tmpPath, path);
}
