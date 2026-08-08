/**
 * Primitives génériques de dessin de boîtes/séparateurs en caractères
 * Unicode. Volontairement "bêtes" : elles ne connaissent aucun thème, ne
 * décident d'aucun style — chaque thème (voir src/themes/) choisit ses
 * propres caractères, largeurs et l'usage qu'il en fait (ou pas du tout,
 * ex: le thème mono n'utilise aucune boîte).
 *
 * Même rôle que fancyFont.js pour les polices : un outil bas niveau
 * partagé, jamais une décision de style en soi.
 */

/** Ligne du haut d'une boîte, ex: boxTop(18, { tl:'╭', tr:'╮', h:'─' }) → "╭──────────────────╮" */
export function boxTop(width, { tl, tr, h }) {
  return `${tl}${h.repeat(width)}${tr}`;
}

/** Ligne du bas d'une boîte, symétrique de boxTop. */
export function boxBottom(width, { bl, br, h }) {
  return `${bl}${h.repeat(width)}${br}`;
}

/** Simple ligne séparatrice (pied de message, sections...). */
export function hLine(width, char = '─') {
  return char.repeat(width);
}

/** Centre un texte dans une largeur donnée, complété par `fillChar` de part et d'autre. */
export function padCenter(text, width, fillChar = ' ') {
  const str = String(text);
  if (str.length >= width) return str;
  const totalPad = width - str.length;
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return fillChar.repeat(left) + str + fillChar.repeat(right);
}
