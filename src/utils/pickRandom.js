/** Choisit un élément au hasard dans un tableau (non vide). */
export function pickRandom(array) {
  return array[Math.floor(Math.random() * array.length)];
}
