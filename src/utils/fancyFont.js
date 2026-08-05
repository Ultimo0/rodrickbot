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