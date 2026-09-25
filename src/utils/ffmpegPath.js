/**
 * Résout le chemin du binaire ffmpeg à utiliser, en donnant la priorité à
 * FFMPEG_PATH s'il est défini.
 *
 * Utile sur Termux/Android : le binaire précompilé fourni par
 * `ffmpeg-static` cible un Linux glibc classique et ne s'exécute pas dans
 * l'environnement Bionic de Termux. On installe alors le vrai ffmpeg
 * (`pkg install ffmpeg`) et on pointe FFMPEG_PATH dessus (généralement
 * `$PREFIX/bin/ffmpeg`, trouvable via `which ffmpeg`).
 *
 * Sur un serveur classique (Render, VPS...), FFMPEG_PATH reste vide et on
 * retombe sur ffmpeg-static — comportement inchangé.
 *
 * Centralisé ici pour n'avoir qu'un seul endroit à ajuster : avant ce
 * fichier, `ffmpeg-static` était importé séparément dans sticker.js,
 * mediaConvert.js et youtube.js.
 */

import ffmpegStaticPath from 'ffmpeg-static';

export const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStaticPath;
