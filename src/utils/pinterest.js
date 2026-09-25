import youtubedl from 'youtube-dl-exec';
import { runDownload } from './youtube.js';
import { logger } from './logger.js';

const PINTEREST_URL_REGEX = /https?:\/\/(www\.)?(pinterest\.[a-z.]+\/pin\/\S+|pin\.it\/\S+)/i;

// Un vrai user-agent de navigateur : Pinterest sert une page "coquille"
// sans aucune métadonnée (ni og:image, ni le JSON embarqué ci-dessous) aux
// requêtes qui n'ont pas l'air de venir d'un navigateur — un précédent
// user-agent générique ("RodrickBOT/1.0") déclenchait systématiquement ce
// comportement et provoquait un "aucun média trouvé" même sur des pins
// publics et valides.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
};

// En-têtes dédiés au téléchargement de l'IMAGE elle-même (i.pinimg.com),
// distincts de BROWSER_HEADERS ci-dessus (prévus pour la page HTML) : le
// CDN d'images de Pinterest applique une protection anti-hotlink basée sur
// le `Referer` — sans lui, il répond avec un statut 200 mais un corps qui
// n'est PAS l'image demandée (page d'erreur/placeholder), que sharp (utilisé
// en interne par Baileys pour générer la miniature) rejette ensuite avec
// "Input file contains unsupported image format".
const IMAGE_HEADERS = {
  'User-Agent': BROWSER_HEADERS['User-Agent'],
  Referer: 'https://www.pinterest.com/',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
};

/** Extrait le premier lien Pinterest (pin ou lien court pin.it) trouvé dans un texte, ou null. */
export function extractPinterestUrl(text) {
  const match = text?.match(PINTEREST_URL_REGEX);
  return match ? match[0] : null;
}

/** Extrait l'identifiant numérique du pin depuis une URL Pinterest résolue (`.../pin/1234567890123456789/`), ou null. */
function extractPinId(url) {
  const m = url?.match(/\/pin\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Cherche le pin dans le JSON de données que Pinterest embarque lui-même
 * dans la page, sous forme d'un VRAI bloc `<script type="application/json">`
 * (donc parsable tel quel avec `JSON.parse`, sans se soucier d'échappement
 * ou d'ordre des clés — contrairement aux regex ci-dessous). C'est la
 * méthode la plus fiable des trois : ancrée sur `pinId` (extrait de l'URL
 * résolue), elle ne peut pas se tromper de pin parmi les nombreux autres
 * pins listés sur la même page (pins "suggérés"/liés dans le carrousel du
 * bas), contrairement à une simple recherche de motif dans tout le texte.
 */
function extractFromPwsData(html, pinId) {
  const scriptMatch = html.match(/<script[^>]+id="__PWS_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!scriptMatch) return null;

  let data;
  try {
    data = JSON.parse(scriptMatch[1]);
  } catch {
    return null;
  }

  const pins = data?.props?.initialReduxState?.pins;
  if (!pins || typeof pins !== 'object') return null;

  // Priorité au pin dont l'ID correspond exactement à celui de l'URL —
  // sans ça, un lien pin.it non résolu (pinId introuvable) retomberait sur
  // le premier pin du dictionnaire, qui est GÉNÉRALEMENT le pin principal
  // de la page mais pas garanti.
  const pin = (pinId && pins[pinId]) || Object.values(pins)[0];
  const url = pin?.images?.orig?.url;
  if (!url) return null;

  return { url, title: pin?.title || pin?.grid_title || null };
}

/**
 * Cherche l'image d'un pin dans le HTML de la page, avec plusieurs replis
 * dans l'ordre de fiabilité décroissante :
 * 1. `extractFromPwsData()` ci-dessus — la seule méthode ancrée sur l'ID
 *    du pin, donc la seule à garantir qu'on ne récupère pas l'image d'un
 *    AUTRE pin listé sur la même page (pins suggérés/liés) — voir le
 *    commentaire de la fonction. Un ancien filet de sécurité qui
 *    récupérait "n'importe quelle URL i.pinimg.com trouvée sur la page,
 *    triée par résolution" a été retiré : constaté en pratique renvoyer
 *    l'image d'un pin suggéré au lieu de celle demandée.
 * 2. Recherche brute de `"orig":{...,"url":"..."}` n'importe où dans le
 *    HTML — filet de sécurité si `__PWS_DATA__` a une structure imprévue,
 *    mais partage la même limite que l'ancien filet ci-dessus (pas ancrée
 *    sur le pin demandé) : gardée uniquement parce qu'en pratique le
 *    PREMIER objet "orig" de la page correspond presque toujours au pin
 *    principal (les pins suggérés apparaissent plus loin dans le HTML).
 * 3. `og:image` / `twitter:image` — standards, et spécifiques à CETTE
 *    page (donc fiables sur ce point), mais Pinterest ne les sert pas
 *    toujours selon la région/le contexte de la requête.
 */
function extractImageFromHtml(html, pinId) {
  const fromPwsData = extractFromPwsData(html, pinId);
  if (fromPwsData) return fromPwsData;

  // Pinterest embarque parfois ses données sous forme de JSON imbriqué
  // (une chaîne JSON contenant elle-même du JSON échappé, ex:
  // `\"orig\":{\"url\":\"https:\/\/i.pinimg.com\/...\"}`) — on normalise
  // une fois ici (`\"` → `"`, `\/` → `/`) pour que la regex ci-dessous
  // n'ait pas à gérer l'échappement elle-même, qu'il soit présent ou non.
  const normalized = html.replace(/\\"/g, '"').replace(/\\\//g, '/');

  const jsonMatch = normalized.match(/"orig"\s*:\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/i);
  if (jsonMatch) return { url: jsonMatch[1], title: null };

  const ogMatch = normalized.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogMatch) return { url: ogMatch[1], title: null };

  const twitterMatch = normalized.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (twitterMatch) return { url: twitterMatch[1], title: null };

  return null;
}

/**
 * Récupère la page HTML d'une URL de pin et tente d'en extraire l'image.
 * Factorisé hors de fetchPinterestMedia() pour être appelé une seconde fois
 * sur l'URL canonique du pin quand la première URL (ex: un lien "/sent/",
 * voir le commentaire dans fetchPinterestMedia) ne donne rien de fiable.
 */
async function fetchAndExtract(url) {
  const res = await fetch(url, { headers: BROWSER_HEADERS });
  if (!res.ok) {
    throw new Error(`Page Pinterest inaccessible (${res.status}).`);
  }
  const html = await res.text();

  // `res.url` est l'URL FINALE après les éventuelles redirections (un lien
  // court pin.it redirige vers `pinterest.com/pin/<id>/`) — indispensable
  // pour ancrer extractImageFromHtml() sur le bon pin, voir son commentaire.
  const pinId = extractPinId(res.url) || extractPinId(url);
  const found = extractImageFromHtml(html, pinId);
  const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);

  return { res, html, pinId, found, titleMatch };
}

/**
 * Ordre de préférence des tailles d'image renvoyées par l'API pidgets
 * ci-dessous (voir fetchFromPidgetsApi) : "orig" (pleine résolution) est
 * rarement présent sur cet endpoint contrairement au HTML de la page, donc
 * on retombe sur la plus grande taille fixe disponible.
 */
const PIDGETS_IMAGE_SIZE_PRIORITY = ['orig', '736x', '564x', '474x', '236x', '170x'];

/**
 * Dernier repli, indépendant du HTML scrapé par fetchAndExtract() ci-dessus :
 * `widgets.pinterest.com/v3/pidgets/pins/info/` est un ancien endpoint JSON
 * public (utilisé historiquement par le widget d'intégration "Pin it"), qui
 * renvoie directement les données d'un pin par son ID sans nécessiter de
 * session/cookie. Il survit aux changements récents de Pinterest observés en
 * production (page de pin qui ne sert plus le JSON `__PWS_DATA__`/les balises
 * `og:image` aux requêtes non authentifiées, y compris sur l'URL canonique du
 * pin — voir le commentaire dans fetchPinterestMedia) puisqu'il ne dépend pas
 * du rendu de la page HTML. Contrairement au HTML, cet endpoint est ancien et
 * non documenté officiellement : il peut disparaître à tout moment, d'où son
 * usage en tout dernier recours plutôt qu'en priorité.
 */
async function fetchFromPidgetsApi(pinId) {
  if (!pinId) return null;

  try {
    const res = await fetch(
      `https://widgets.pinterest.com/v3/pidgets/pins/info/?pin_ids=${pinId}&sub=www&base_scheme=https`,
      { headers: { 'User-Agent': BROWSER_HEADERS['User-Agent'] } }
    );
    if (!res.ok) return null;

    const text = await res.text();
    // Le corps est généralement du JSON pur, mais certaines variantes de cet
    // endpoint (historiquement pensé pour du JSONP) l'enveloppent dans un
    // appel de callback JS — on isole donc le premier objet JSON du texte
    // plutôt que de faire confiance à un JSON.parse direct sur toute la
    // réponse.
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const data = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    const pins = data?.data?.pins;
    if (!Array.isArray(pins) || pins.length === 0) return null;

    const pin = pins.find((p) => String(p?.id) === String(pinId)) || pins[0];
    const images = pin?.images;
    if (!images) return null;

    const sizeKey = PIDGETS_IMAGE_SIZE_PRIORITY.find((key) => images[key]?.url);
    if (!sizeKey) return null;

    return { url: images[sizeKey].url, title: pin?.description || pin?.grid_title || null };
  } catch {
    // Endpoint non officiel : toute erreur (réseau, JSON invalide, structure
    // inattendue) doit rester silencieuse ici et laisser fetchPinterestMedia
    // retomber sur le message d'erreur générique existant.
    return null;
  }
}

/**
 * Un "pin" Pinterest est soit une vidéo, soit une simple image — contrairement
 * à TikTok/Facebook/Instagram qui sont uniquement vidéo. On tente d'abord
 * yt-dlp (qui gère les pins vidéo), et seulement en cas d'échec on retombe
 * sur une extraction du HTML de la page (pins image, largement majoritaires
 * sur Pinterest) — voir extractImageFromHtml() ci-dessus pour l'ordre des
 * méthodes essayées.
 * @returns {Promise<{type: 'video'|'image', url: string, title: string}>}
 */
export async function fetchPinterestMedia(pageUrl) {
  try {
    const info = await youtubedl(pageUrl, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      noPlaylist: true,
      addHeader: [`User-Agent:${BROWSER_HEADERS['User-Agent']}`],
    });
    if (info?.url || info?.formats?.length) {
      return { type: 'video', url: pageUrl, title: info.title || 'pinterest' };
    }
  } catch {
    // Pas une vidéo (ou yt-dlp ne gère pas ce pin) — on retombe sur l'image.
  }

  let { res, html, pinId, found, titleMatch } = await fetchAndExtract(pageUrl);

  // Pinterest sert un lien "envoyé à quelqu'un" (`/pin/<id>/sent/?invite_code=...
  // &sender=...&sfo=1`, généré quand un pin est partagé nommément — via WhatsApp,
  // iMessage, etc. — plutôt que copié depuis la page du pin) sous la forme d'un
  // shell applicatif DIFFÉRENT de la page de pin standard : orienté connexion/
  // installation de l'app, sans le bloc `__PWS_DATA__` ni les balises `og:image`/
  // `twitter:image` du pin réel. Le pinId reste correctement extrait de cette
  // URL (voir extractPinId), donc si l'extraction échoue on retente une fois sur
  // l'URL CANONIQUE du pin reconstruite à partir de ce pinId, qui elle contient
  // les données complètes. `containsPinimg` peut être `true` sur la page `/sent/`
  // sans que ça contredise ce diagnostic : ce sont les logos/assets d'interface
  // du shell, pas l'image du pin demandé.
  if (!found && pinId) {
    const canonicalUrl = `https://www.pinterest.com/pin/${pinId}/`;
    if (res.url !== canonicalUrl && pageUrl !== canonicalUrl) {
      ({ res, html, pinId, found, titleMatch } = await fetchAndExtract(canonicalUrl));
    }
  }

  // Dernier recours si le HTML scrapé (page d'origine ET, le cas échéant,
  // sa variante canonique ci-dessus) ne contient les données d'aucun pin —
  // voir fetchFromPidgetsApi() pour le contexte (page de pin ne servant
  // plus le JSON embarqué aux requêtes non authentifiées).
  let fromPidgets = null;
  if (!found && pinId) {
    fromPidgets = await fetchFromPidgetsApi(pinId);
  }

  if (!found && !fromPidgets) {
    // Diagnostic serveur uniquement (jamais montré à l'utilisateur WhatsApp) :
    // utile pour comprendre POURQUOI l'extraction a échoué la prochaine fois
    // (page de connexion forcée, structure Pinterest changée, etc.) sans
    // avoir à reproduire le bug en aveugle. `finalUrl` révèle si pin.it a
    // redirigé vers une page inattendue (interstitiel, consentement...),
    // et `containsPinimg` dit si le domaine CDN est simplement absent de
    // cette page (compte privé/supprimé) ou juste dans un format que nos
    // regex ne reconnaissent pas encore.
    logger.warn(
      {
        pageUrl,
        finalUrl: res.url,
        pinId,
        status: res.status,
        htmlLength: html.length,
        containsPinimg: html.includes('pinimg.com'),
        htmlStart: html.slice(0, 300),
      },
      'Pinterest : aucune image trouvée dans le HTML de la page'
    );
    throw new Error('Aucun média trouvé sur ce pin (lien invalide, privé, ou supprimé).');
  }

  return {
    type: 'image',
    url: (found || fromPidgets).url,
    title: (found || fromPidgets).title || titleMatch?.[1] || 'pinterest',
  };
}

/** Télécharge la vidéo d'un pin vidéo (mp4). Réutilise runDownload de utils/youtube.js. */
export async function downloadPinterestVideo(pageUrl) {
  return runDownload(
    pageUrl,
    { format: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best', mergeOutputFormat: 'mp4' },
    'mp4'
  );
}

/**
 * Télécharge l'image d'un pin image (URL directe extraite du HTML de la
 * page). Vérifie le `content-type` de la réponse AVANT de renvoyer le
 * buffer : sans cette vérification, un corps de réponse qui n'est pas
 * réellement une image (page d'erreur du CDN servie avec un statut 200,
 * voir IMAGE_HEADERS ci-dessus) remonte tel quel jusqu'à Baileys, qui
 * plante en interne dans sharp au moment de générer la miniature du
 * message ("Input file contains unsupported image format") — une erreur
 * qui n'atteint jamais le catch de commands/pinterest.js puisqu'elle
 * survient PENDANT l'envoi du message, pas pendant le téléchargement.
 */
export async function downloadPinterestImage(imageUrl) {
  const res = await fetch(imageUrl, { headers: IMAGE_HEADERS });
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok || !contentType.startsWith('image/')) {
    const bodySnippet = await res
      .text()
      .then((t) => t.slice(0, 300))
      .catch(() => '');
    logger.warn(
      { imageUrl, status: res.status, contentType, bodySnippet },
      "Pinterest : le CDN n'a pas renvoyé une image exploitable"
    );
    throw new Error("Téléchargement de l'image impossible (réponse invalide du CDN Pinterest).");
  }

  return Buffer.from(await res.arrayBuffer());
}
