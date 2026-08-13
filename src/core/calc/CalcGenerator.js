/**
 * CalcGenerator
 * -------------
 * Génère une opération arithmétique à la volée (pas de banque de données,
 * contrairement au Quiz) — aucune dépendance disque ni réseau. La division
 * est toujours construite à l'envers (quotient × diviseur = dividende) pour
 * garantir un résultat entier exact, jamais une division qui "tombe juste"
 * par hasard.
 */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function additionOrSoustraction(min, max) {
  const a = randInt(min, max);
  const b = randInt(min, max);
  const isAddition = Math.random() < 0.5;
  return isAddition ? { text: `${a} + ${b}`, answer: a + b } : { text: `${a} - ${b}`, answer: a - b };
}

function multiplication(max = 12) {
  const a = randInt(2, max);
  const b = randInt(2, 12);
  return { text: `${a} × ${b}`, answer: a * b };
}

function division() {
  const diviseur = randInt(2, 12);
  const quotient = randInt(2, 12);
  return { text: `${diviseur * quotient} ÷ ${diviseur}`, answer: quotient };
}

/** Génère une opération adaptée à la difficulté. */
export function generateOperation(difficulty) {
  switch (difficulty) {
    case 'facile':
      return additionOrSoustraction(1, 20);

    case 'difficile': {
      const roll = Math.random();
      if (roll < 0.35) return division();
      if (roll < 0.7) return multiplication(15);
      return additionOrSoustraction(20, 99);
    }

    case 'moyen':
    default: {
      const roll = Math.random();
      if (roll < 0.35) return multiplication();
      return additionOrSoustraction(1, 50);
    }
  }
}
