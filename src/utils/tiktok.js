const TIKTOK_URL_REGEX = /https?:\/\/(www\.|vt\.|vm\.|m\.)?tiktok\.com\/\S+/i;

/** true si le texte contient un lien TikTok. */
export function isTikTokUrl(text) {
  return TIKTOK_URL_REGEX.test(text || '');
}

/** Extrait le premier lien TikTok trouvé dans un texte, ou null. */
export function extractTikTokUrl(text) {
  const match = text?.match(TIKTOK_URL_REGEX);
  return match ? match[0] : null;
}

function resolveUrl(url) {
  if (!url) return null;
  return url.startsWith('http') ? url : `https://www.tikwm.com${url}`;
}

/** Interroge l'API publique tikwm pour récupérer les liens directs audio/vidéo. */
export async function fetchTikTokData(url) {
  const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`Erreur API (${res.status})`);

  const json = await res.json();
  if (json.code !== 0 || !json.data) {
    throw new Error(json.msg || 'Vidéo introuvable ou lien invalide.');
  }

  return {
    title: json.data.title || 'tiktok',
    videoUrl: resolveUrl(json.data.play),
    musicUrl: resolveUrl(json.data.music),
  };
}

/** Télécharge un fichier distant et retourne son contenu en Buffer. */
export async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Téléchargement échoué (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}