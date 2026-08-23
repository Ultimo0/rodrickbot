// src/utils/unitConverter.js

/**
 * Convertisseur d'unités
 * Support : température, longueur, masse, volume, surface, vitesse, durée.
 */

// --- Définitions des unités ---

// Base SI pour les conversions linéaires : mètre, gramme, litre, m², km/h, seconde
const UNITS = {
  // Longueur (base: mètre)
  length: {
    m: { factor: 1, aliases: ['m', 'metre', 'mètre', 'meters', 'mètres'] },
    km: { factor: 1000, aliases: ['km', 'kilometre', 'kilomètre', 'kilometers', 'kilomètres'] },
    cm: { factor: 0.01, aliases: ['cm', 'centimetre', 'centimètre', 'centimeters', 'centimètres'] },
    mm: { factor: 0.001, aliases: ['mm', 'millimetre', 'millimètre', 'millimeters', 'millimètres'] },
    mi: { factor: 1609.344, aliases: ['mi', 'mile', 'miles'] },
    yd: { factor: 0.9144, aliases: ['yd', 'yard', 'yards'] },
    ft: { factor: 0.3048, aliases: ['ft', 'pied', 'feet', 'pieds'] },
    in: { factor: 0.0254, aliases: ['in', 'pouce', 'inches', 'pouces'] },
  },
  // Masse (base: gramme)
  mass: {
    g: { factor: 1, aliases: ['g', 'gramme', 'gram', 'grams', 'grammes'] },
    kg: { factor: 1000, aliases: ['kg', 'kilogramme', 'kilogram', 'kilograms', 'kilogrammes'] },
    mg: { factor: 0.001, aliases: ['mg', 'milligramme', 'milligram', 'milligrams', 'milligrammes'] },
    lb: { factor: 453.592, aliases: ['lb', 'livre', 'pound', 'pounds', 'livres'] },
    oz: { factor: 28.3495, aliases: ['oz', 'once', 'ounce', 'ounces', 'onces'] },
  },
  // Volume (base: litre)
  volume: {
    l: { factor: 1, aliases: ['l', 'litre', 'liter', 'liters', 'litres'] },
    ml: { factor: 0.001, aliases: ['ml', 'millilitre', 'milliliter', 'milliliters', 'millilitres'] },
    cl: { factor: 0.01, aliases: ['cl', 'centilitre', 'centiliter', 'centiliters', 'centilitres'] },
    gal: { factor: 3.78541, aliases: ['gal', 'gallon', 'gallons'] },
    qt: { factor: 0.946353, aliases: ['qt', 'quart', 'quarts'] },
    pt: { factor: 0.473176, aliases: ['pt', 'pinte', 'pint', 'pints', 'pintes'] },
  },
  // Surface (base: m²)
  area: {
    m2: { factor: 1, aliases: ['m²', 'm2', 'metre carre', 'mètre carré', 'square meter', 'square meters'] },
    km2: { factor: 1_000_000, aliases: ['km²', 'km2', 'kilometre carre', 'kilomètre carré', 'square kilometer', 'square kilometers'] },
    cm2: { factor: 0.0001, aliases: ['cm²', 'cm2', 'centimetre carre', 'centimètre carré', 'square centimeter', 'square centimeters'] },
    ha: { factor: 10_000, aliases: ['ha', 'hectare', 'hectares'] },
    acre: { factor: 4046.86, aliases: ['acre', 'acres'] },
    ft2: { factor: 0.092903, aliases: ['ft²', 'ft2', 'pied carre', 'pied carré', 'square foot', 'square feet'] },
    mi2: { factor: 2_589_988, aliases: ['mi²', 'mi2', 'mile carre', 'mile carré', 'square mile', 'square miles'] },
  },
  // Vitesse (base: km/h)
  speed: {
    kmh: { factor: 1, aliases: ['km/h', 'kmh', 'kph', 'kilometre par heure', 'kilomètre par heure', 'kilometers per hour'] },
    ms: { factor: 3.6, aliases: ['m/s', 'ms', 'metre par seconde', 'mètre par seconde', 'meters per second'] },
    mph: { factor: 1.60934, aliases: ['mph', 'mile par heure', 'miles per hour'] },
    kn: { factor: 1.852, aliases: ['kn', 'noeud', 'noeuds', 'knot', 'knots'] },
  },
  // Durée (base: seconde)
  duration: {
    s: { factor: 1, aliases: ['s', 'sec', 'second', 'seconde', 'seconds', 'secondes'] },
    min: { factor: 60, aliases: ['min', 'mn', 'minute', 'minutes'] },
    h: { factor: 3600, aliases: ['h', 'hr', 'hour', 'heure', 'hours', 'heures'] },
    d: { factor: 86400, aliases: ['d', 'j', 'day', 'jour', 'days', 'jours'] },
    w: { factor: 604800, aliases: ['w', 'sem', 'week', 'semaine', 'weeks', 'semaines'] },
    month: { factor: 2592000, aliases: ['mois', 'month', 'months'] },
    year: { factor: 31536000, aliases: ['an', 'year', 'years', 'année', 'années'] },
  },
};

// Catégories spéciales (température)
const TEMP_UNITS = {
  C: { aliases: ['°C', 'c', 'celsius', 'Celsius'] },
  F: { aliases: ['°F', 'f', 'fahrenheit', 'Fahrenheit'] },
  K: { aliases: ['K', 'k', 'kelvin', 'Kelvin'] },
};

// Mapping alias -> clé normalisée
const aliasMap = {};
for (const [cat, items] of Object.entries(UNITS)) {
  for (const [key, def] of Object.entries(items)) {
    for (const alias of def.aliases) {
      aliasMap[alias.toLowerCase()] = { category: cat, key };
    }
  }
}
// Températures
for (const [key, def] of Object.entries(TEMP_UNITS)) {
  for (const alias of def.aliases) {
    aliasMap[alias.toLowerCase()] = { category: 'temperature', key };
  }
}

// --- Fonctions de conversion ---

function convertLinear(value, fromFactor, toFactor) {
  // On convertit en base, puis en cible
  const baseValue = value * fromFactor;
  return baseValue / toFactor;
}

function convertTemperature(value, fromKey, toKey) {
  let kelvin;
  // Vers Kelvin
  if (fromKey === 'C') kelvin = value + 273.15;
  else if (fromKey === 'F') kelvin = (value + 459.67) * 5 / 9;
  else if (fromKey === 'K') kelvin = value;
  else return null;

  // De Kelvin vers cible
  if (toKey === 'C') return kelvin - 273.15;
  if (toKey === 'F') return kelvin * 9 / 5 - 459.67;
  if (toKey === 'K') return kelvin;
  return null;
}

// --- Parsing de la commande ---

function normalizeUnit(raw) {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  // Gestion des symboles spéciaux : °C, °F, m², km/h...
  // On essaye d'abord de matcher avec les alias exacts après normalisation
  // On va chercher dans le map
  if (aliasMap[cleaned]) return aliasMap[cleaned];

  // Tentative avec remplacement des caractères unicode (², °)
  const variants = [
    cleaned,
    cleaned.replace('°', 'deg'),
    cleaned.replace('²', '2'),
    cleaned.replace('carré', 'carre'),
    cleaned.replace('par', '/'),
  ];
  for (const v of variants) {
    if (aliasMap[v]) return aliasMap[v];
  }
  return null;
}

function parseAndConvert(input) {
  // Format : <nombre> <unité_source> en <unité_cible>
  // On autorise "vers" ou "=>" comme séparateurs
  const separators = [' en ', ' vers ', ' => '];
  let parts = null;
  for (const sep of separators) {
    const split = input.split(sep);
    if (split.length === 2) {
      parts = split.map(s => s.trim());
      break;
    }
  }
  if (!parts) {
    return { ok: false, message: '❌ Format invalide. Utilise : /convert <valeur> <unité> en <unité>' };
  }

  const [left, right] = parts;
  // Extraire le nombre et l'unité source
  const numMatch = left.match(/^([\d.]+)\s*(.+)$/);
  if (!numMatch) {
    return { ok: false, message: '❌ La valeur doit être un nombre (ex: 25, 100.5).' };
  }
  const amount = parseFloat(numMatch[1]);
  if (isNaN(amount) || amount < 0) {
    return { ok: false, message: '❌ La valeur doit être un nombre positif.' };
  }
  const fromRaw = numMatch[2].trim();
  const toRaw = right.trim();

  const fromInfo = normalizeUnit(fromRaw);
  const toInfo = normalizeUnit(toRaw);

  if (!fromInfo) return { ok: false, message: `❌ Unité source "${fromRaw}" non reconnue.` };
  if (!toInfo) return { ok: false, message: `❌ Unité cible "${toRaw}" non reconnue.` };

  if (fromInfo.category !== toInfo.category) {
    return { ok: false, message: `❌ Impossible de convertir ${fromRaw} en ${toRaw} (catégories différentes).` };
  }

  const cat = fromInfo.category;
  let result;

  if (cat === 'temperature') {
    result = convertTemperature(amount, fromInfo.key, toInfo.key);
    if (result === null) return { ok: false, message: '❌ Erreur interne de conversion de température.' };
  } else {
    const fromFactor = UNITS[cat][fromInfo.key].factor;
    const toFactor = UNITS[cat][toInfo.key].factor;
    result = convertLinear(amount, fromFactor, toFactor);
  }

  // Arrondi pour éviter les flottants trop longs
  const rounded = Math.round(result * 10000) / 10000;

  // Trouver le symbole d'affichage original (on prend le premier alias)
  const fromLabel = fromRaw;
  const toLabel = toRaw;

  return {
    ok: true,
    amount,
    fromUnit: fromLabel,
    toUnit: toLabel,
    converted: rounded,
    display: `${amount} ${fromLabel} = ${rounded} ${toLabel}`
  };
}

export { parseAndConvert };