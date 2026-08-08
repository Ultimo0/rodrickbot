/**
 * Convertit du texte latin simple en police "script" (cursive) Unicode,
 * du même style que developerName dans settings.json (𝓡𝓸𝓭𝓻𝓲𝓰𝓾𝓮...).
 * Utilise le bloc Unicode "Mathematical Bold Script" (continu, sans trous
 * pour les lettres A-Z / a-z). Les caractères non alphabétiques
 * (chiffres, espaces, ponctuation) restent inchangés.
 */
const UPPER_BASE = 0x1d4d0; // 'A' en Mathematical Bold Script
const LOWER_BASE = 0x1d4ea; // 'a' en Mathematical Bold Script

export function toScriptFont(text) {
  return String(text)
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 65 && code <= 90) {
        // A-Z
        return String.fromCodePoint(UPPER_BASE + (code - 65));
      }
      if (code >= 97 && code <= 122) {
        // a-z
        return String.fromCodePoint(LOWER_BASE + (code - 97));
      }
      return char;
    })
    .join('');
}

/**
 * Familles de polices Unicode supplémentaires, utilisées librement par
 * les thèmes visuels (voir src/themes/). Toutes basées sur le bloc "Mathematical
 * Alphanumeric Symbols" en plages CONTINUES (majuscules, minuscules,
 * chiffres) — contrairement à "double-struck" ou "fraktur" qui ont des
 * exceptions historiques (ex: ℂ, ℍ, ℕ hors bloc), donc volontairement
 * évitées ici pour ne pas avoir à gérer des cas particuliers.
 */
function makeMathFont({ upperBase, lowerBase, digitBase }) {
  return (text) =>
    String(text)
      .split('')
      .map((char) => {
        const code = char.charCodeAt(0);
        if (code >= 65 && code <= 90) return String.fromCodePoint(upperBase + (code - 65));
        if (code >= 97 && code <= 122) return String.fromCodePoint(lowerBase + (code - 97));
        if (digitBase != null && code >= 48 && code <= 57) return String.fromCodePoint(digitBase + (code - 48));
        return char;
      })
      .join('');
}

/** 𝐆𝐫𝐚𝐬 mathématique (Mathematical Bold). */
export const toBoldFont = makeMathFont({ upperBase: 0x1d400, lowerBase: 0x1d41a, digitBase: 0x1d7ce });

/** 𝗦𝗮𝗻𝘀-𝘀𝗲𝗿𝗶𝗳 𝗴𝗿𝗮𝘀 (Mathematical Sans-Serif Bold). */
export const toSansBoldFont = makeMathFont({ upperBase: 0x1d5d4, lowerBase: 0x1d5ee, digitBase: 0x1d7ec });

/** 𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎 (Mathematical Monospace). */
export const toMonospaceFont = makeMathFont({ upperBase: 0x1d670, lowerBase: 0x1d68a, digitBase: 0x1d7f6 });