import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_FILE = path.join(__dirname, '..', '..', 'data', 'quizQuestions.json'); // banque de secours embarquée
const CACHE_FILE = path.join(process.cwd(), 'quiz_questions_cache.json'); // questions internet mises en cache

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h avant de considérer le cache périmé
const OPENTDB_TIMEOUT_MS = 15_000;
const OPENTDB_DELAY_BETWEEN_CALLS_MS = 5_500; // OpenTDB limite à ~1 requête/5s par IP
const QUESTIONS_PER_CATEGORY = 25;

// Mêmes noms de catégorie que l'ancienne banque locale, pour rester
// compatible avec `/quiz geographie`, `/quiz sciences`, etc. déjà en usage.
// Ids Open Trivia DB : https://opentdb.com/api_category.php
const OPENTDB_CATEGORIES = {
  geographie: 22,
  histoire: 23,
  sciences: 17,
  informatique: 18,
};

/**
 * QuizLoader
 * ----------
 * Seul point d'accès aux questions. Les questions viennent d'Internet (Open
 * Trivia Database, https://opentdb.com — gratuit, sans clé), traduites en
 * français via MyMemory (https://mymemory.translated.net — gratuit, sans
 * clé non plus, ~5000 mots/jour/IP), puis mises en cache sur disque 24h.
 * Aucune clé API n'est nécessaire pour ce module — volontairement découplé
 * de Groq (utilisé ailleurs dans le bot) pour ne pas consommer son quota.
 *
 * Fiabilité en 3 niveaux, du plus prioritaire au moins prioritaire :
 *  1. Cache disque encore frais (< 24h) -> chargé instantanément.
 *  2. Récupération Internet + traduction MyMemory -> se met en cache.
 *  3. Si les deux échouent (pas d'internet, MyMemory hors service...) ->
 *     bascule sur la petite banque locale embarquée
 *     (`src/data/quizQuestions.json`), pour que `/quiz` continue de
 *     fonctionner même hors ligne.
 *
 * Au démarrage, la banque de secours est chargée en synchrone (le bot ne
 * doit pas attendre avant que `/quiz` réponde), puis le rafraîchissement
 * Internet tourne en tâche de fond et remplace le pool dès qu'il aboutit —
 * de façon transparente pour les parties déjà en cours (voir
 * QuizEngine.sendQuestionCard, qui termine proprement une session si une
 * question référencée disparaît en cours de route).
 *
 * Limite assumée : contrairement à un service de traduction par IA,
 * MyMemory ne peut pas générer d'explication pédagogique — les questions
 * venant d'Internet n'ont donc pas de champ `explanation` (uniquement la
 * banque de secours locale en a). La qualité de traduction est aussi plus
 * littérale qu'avec un LLM ; à surveiller en usage réel.
 */

let questions = [];
let byId = new Map();
let byCategory = new Map();
let source = 'none'; // 'fallback' | 'cache' | 'internet' | 'none'
let lastFetchedAt = null;

function isValidQuestion(q) {
  return (
    q &&
    typeof q.id === 'string' &&
    typeof q.category === 'string' &&
    ['facile', 'moyen', 'difficile'].includes(q.difficulty) &&
    typeof q.question === 'string' &&
    Array.isArray(q.options) &&
    q.options.length >= 2 &&
    q.options.length <= 4 &&
    Number.isInteger(q.correctIndex) &&
    q.correctIndex >= 0 &&
    q.correctIndex < q.options.length
  );
}

function indexQuestions(list, newSource) {
  questions = list;
  byId = new Map(list.map((q) => [q.id, q]));
  byCategory = new Map();
  for (const q of list) {
    if (!byCategory.has(q.category)) byCategory.set(q.category, []);
    byCategory.get(q.category).push(q);
  }
  source = newSource;
}

function loadFallbackBank() {
  try {
    const raw = JSON.parse(readFileSync(FALLBACK_FILE, 'utf-8'));
    const valid = (raw.questions || []).filter((q) => {
      const ok = isValidQuestion(q);
      if (!ok) logger.warn({ id: q?.id }, 'Question quiz (banque de secours) ignorée (format invalide)');
      return ok;
    });
    indexQuestions(valid, 'fallback');
    logger.info(`Quiz: banque de secours locale active (${valid.length} questions) en attendant Internet`);
  } catch (err) {
    logger.error({ err }, 'Impossible de charger la banque de secours locale — module Quiz désactivé');
    indexQuestions([], 'none');
  }
}

/** Charge le cache disque s'il existe et a moins de 24h. Retourne true si appliqué. */
function loadCacheIfFresh() {
  if (!existsSync(CACHE_FILE)) return false;
  try {
    const cached = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    if (!cached.fetchedAt || Date.now() - cached.fetchedAt > CACHE_TTL_MS) return false;

    const valid = (cached.questions || []).filter(isValidQuestion);
    if (!valid.length) return false;

    indexQuestions(valid, 'cache');
    lastFetchedAt = cached.fetchedAt;
    logger.info(
      `Quiz: ${valid.length} questions chargées depuis le cache Internet (récupérées le ${new Date(cached.fetchedAt).toLocaleString('fr-FR')})`
    );
    return true;
  } catch (err) {
    logger.warn({ err }, 'Cache de questions Internet illisible, ignoré');
    return false;
  }
}

function persistCache(list) {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), questions: list }, null, 2));
  } catch (err) {
    logger.warn({ err }, "Impossible d'écrire le cache de questions Internet (quiz_questions_cache.json)");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Open Trivia DB encode le texte en entités HTML (encode_url3/HTML par défaut).
const HTML_ENTITIES = {
  '&quot;': '"',
  '&#039;': "'",
  '&apos;': "'",
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&eacute;': 'é',
  '&egrave;': 'è',
  '&ecirc;': 'ê',
  '&ccedil;': 'ç',
  '&agrave;': 'à',
  '&ucirc;': 'û',
  '&ocirc;': 'ô',
  '&hellip;': '…',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&Eacute;': 'É',
  '&uuml;': 'ü',
  '&auml;': 'ä',
  '&ouml;': 'ö',
  '&ntilde;': 'ñ',
  '&deg;': '°',
};

function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-zA-Z]+;/g, (entity) => HTML_ENTITIES[entity] ?? entity);
}

async function fetchOpenTdbCategory(categoryId, amount = QUESTIONS_PER_CATEGORY) {
  const url = `https://opentdb.com/api.php?amount=${amount}&category=${categoryId}&type=multiple`;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), OPENTDB_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OpenTDB HTTP ${res.status}`);
    const json = await res.json();
    // response_code 1 = pas assez de questions dispo pour ce lot (banque OpenTDB
    // limitée sur certaines catégories) : on garde ce qu'il y a plutôt que d'échouer.
    if (json.response_code !== 0 && json.response_code !== 1) {
      throw new Error(`OpenTDB response_code ${json.response_code}`);
    }
    return json.results || [];
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('OpenTDB : délai de réponse dépassé.');
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Exécute `worker` sur chaque élément de `items`, au maximum `limit` en
 * parallèle. Sans dépendance externe (pas de p-limit) — juste assez pour
 * traduire ~200-300 segments courts sans matraquer l'API gratuite MyMemory
 * avec des centaines de requêtes strictement simultanées.
 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runOne() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
}

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';
const MYMEMORY_TIMEOUT_MS = 10_000;
const MYMEMORY_CONCURRENCY = 4;
const translationCache = new Map(); // texte anglais -> texte français, évite de re-traduire les doublons

/** Traduit un segment court (anglais -> français) via l'API gratuite MyMemory. */
async function translateToFrench(text) {
  const source = text.trim();
  if (!source) return '';
  if (translationCache.has(source)) return translationCache.get(source);

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), MYMEMORY_TIMEOUT_MS);

  try {
    const url = `${MYMEMORY_URL}?q=${encodeURIComponent(source)}&langpair=en|fr`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
    const json = await res.json();

    let translated = json?.responseData?.translatedText;
    // MyMemory renvoie ce texte (au lieu d'une vraie traduction) une fois le
    // quota gratuit journalier épuisé — à traiter comme un échec, pas un résultat.
    if (!translated || /MYMEMORY WARNING/i.test(translated)) {
      throw new Error('MyMemory : quota gratuit journalier probablement atteint.');
    }

    translated = decodeHtmlEntities(translated).trim();
    translationCache.set(source, translated);
    return translated;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('MyMemory : délai de réponse dépassé.');
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * Traduit tous les champs texte d'un lot de questions OpenTDB (question +
 * réponse correcte + réponses incorrectes), avec repli discret par segment :
 * un segment dont la traduction échoue garde son texte anglais plutôt que
 * de faire échouer toute la question. Retourne une Map<index, champs traduits>.
 */
async function translateRawQuestions(rawItems) {
  const jobs = [];
  rawItems.forEach((item, i) => {
    jobs.push({ i, field: 'question', text: decodeHtmlEntities(item.question) });
    jobs.push({ i, field: 'correct', text: decodeHtmlEntities(item.correct_answer) });
    item.incorrect_answers.forEach((answer, j) => {
      jobs.push({ i, field: `incorrect${j}`, text: decodeHtmlEntities(answer) });
    });
  });

  const translatedJobs = await mapWithConcurrency(jobs, MYMEMORY_CONCURRENCY, async (job) => {
    try {
      return { ...job, translated: await translateToFrench(job.text) };
    } catch (err) {
      logger.warn({ err: err.message, text: job.text }, 'MyMemory : échec de traduction pour ce segment, gardé en anglais');
      return { ...job, translated: job.text };
    }
  });

  const byIndex = new Map();
  for (const job of translatedJobs) {
    if (!byIndex.has(job.i)) byIndex.set(job.i, {});
    byIndex.get(job.i)[job.field] = job.translated;
  }
  return byIndex;
}

const DIFFICULTY_MAP = { easy: 'facile', medium: 'moyen', hard: 'difficile' };
let idCounter = 0;

/**
 * Récupère un nouveau lot de questions depuis Open Trivia DB, les traduit,
 * remplace le pool en mémoire et met à jour le cache disque. Ne touche à
 * rien tant que tout n'a pas réussi (pas de remplacement partiel en cas
 * d'échec à mi-parcours) — le pool précédent (fallback, cache, ou ancien
 * fetch) reste actif si cette fonction lève une erreur.
 */
export async function refreshFromInternet() {
  const allRaw = [];
  const categoryOf = [];

  for (const [category, categoryId] of Object.entries(OPENTDB_CATEGORIES)) {
    try {
      const results = await fetchOpenTdbCategory(categoryId);
      for (const item of results) {
        categoryOf.push(category);
        allRaw.push(item);
      }
    } catch (err) {
      logger.warn({ err: err.message, category }, 'OpenTDB : échec pour cette catégorie, ignorée');
    }
    await sleep(OPENTDB_DELAY_BETWEEN_CALLS_MS); // respecte la limite de débit d'OpenTDB entre chaque catégorie
  }

  if (allRaw.length === 0) {
    throw new Error('Aucune question récupérée depuis Open Trivia DB (toutes les catégories ont échoué).');
  }

  const translatedByIndex = await translateRawQuestions(allRaw);

  const built = [];
  allRaw.forEach((raw, i) => {
    const t = translatedByIndex.get(i);
    if (!t || !t.question || !t.correct) return;

    const incorrect = Object.keys(t)
      .filter((key) => key.startsWith('incorrect'))
      .sort()
      .map((key) => t[key]);
    if (incorrect.length === 0) return;

    const options = [...incorrect, t.correct].sort(() => Math.random() - 0.5);
    const correctIndex = options.indexOf(t.correct);
    if (correctIndex === -1) return; // sécurité : collision de libellé improbable, on ignore plutôt que de planter

    const question = {
      id: `net-${idCounter++}`,
      category: categoryOf[i],
      difficulty: DIFFICULTY_MAP[raw.difficulty] || 'moyen',
      question: t.question,
      options,
      correctIndex,
      // pas d'"explanation" pour les questions Internet : MyMemory traduit,
      // il ne génère pas de contenu pédagogique (contrairement à un LLM).
    };

    if (isValidQuestion(question)) built.push(question);
  });

  if (built.length === 0) {
    throw new Error('Aucune question valide après traduction.');
  }

  indexQuestions(built, 'internet');
  lastFetchedAt = Date.now();
  persistCache(built);
  logger.info(`Quiz: ${built.length} questions récupérées depuis Internet (Open Trivia DB) et traduites, mises en cache 24h`);
  return built.length;
}

/** Démarrage instantané (synchrone) : banque de secours, le temps que le fetch Internet aboutisse. */
function bootstrapSync() {
  loadFallbackBank();
}

/** Rafraîchissement en tâche de fond, ne bloque jamais le démarrage du bot. */
async function bootstrapAsync() {
  if (loadCacheIfFresh()) return;
  try {
    await refreshFromInternet();
  } catch (err) {
    logger.error({ err: err.message }, 'Quiz: échec de la récupération Internet au démarrage — banque de secours locale conservée');
  }
}

bootstrapSync();
bootstrapAsync();

export function getQuestionById(id) {
  return byId.get(id) || null;
}

export function listCategories() {
  return [...byCategory.keys()];
}

/**
 * Tire `count` questions au hasard, filtrées par catégorie/difficulté
 * (optionnelles), en évitant en priorité les ids listés dans `excludeIds`
 * (typiquement : les questions vues récemment par cet utilisateur — voir
 * QuizEngine). Si le pool restant après exclusion est trop petit, complète
 * avec des questions déjà vues plutôt que de renvoyer moins que `count` —
 * la répétition occasionnelle est préférable à une partie plus courte.
 * Retourne moins que `count` uniquement si le pool filtré (catégorie/
 * difficulté) est lui-même plus petit que `count`, même sans exclusion.
 */
export function pickRandomQuestions(count, { category, difficulty, excludeIds } = {}) {
  let pool = questions;
  if (category) pool = pool.filter((q) => q.category === category);
  if (difficulty) pool = pool.filter((q) => q.difficulty === difficulty);

  const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
  const exclude = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || []);

  const fresh = shuffle(pool.filter((q) => !exclude.has(q.id)));
  const picked = fresh.slice(0, count);

  if (picked.length < count) {
    const alreadySeen = shuffle(pool.filter((q) => exclude.has(q.id)));
    picked.push(...alreadySeen.slice(0, count - picked.length));
  }

  return picked;
}

export function getQuestionCount() {
  return questions.length;
}

/** État de la banque actuelle, pour diagnostic (ex: /quiz refresh). */
export function getQuestionsSource() {
  return { source, count: questions.length, categories: byCategory.size, lastFetchedAt };
}

/** Forcer un rafraîchissement immédiat depuis Internet, en ignorant la fraîcheur du cache (admin — /quiz refresh). */
export async function reloadQuestions() {
  await refreshFromInternet();
  return getQuestionsSource();
}

/**
 * Supprime quiz_questions_cache.json (usage admin — /quiz purge) et retombe
 * immédiatement sur la banque de secours locale en mémoire, le temps que le
 * prochain /quiz refresh (ou le prochain redémarrage) récupère un nouveau
 * lot depuis Internet. Retourne true si un fichier de cache a été supprimé.
 */
export function purgeCache() {
  const existed = existsSync(CACHE_FILE);
  if (existed) {
    try {
      unlinkSync(CACHE_FILE);
    } catch (err) {
      logger.warn({ err }, "Impossible de supprimer quiz_questions_cache.json");
    }
  }
  lastFetchedAt = null;
  loadFallbackBank(); // le pool ne doit jamais rester vide entre la purge et le prochain refresh
  return existed;
}
