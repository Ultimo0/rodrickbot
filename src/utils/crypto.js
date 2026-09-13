const SEARCH_URL = 'https://api.coingecko.com/api/v3/search';
const PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price';

/**
 * CoinGecko identifie chaque pièce par un "id" (ex: "bitcoin"), pas par
 * son symbole boursier ("BTC") — il faut donc d'abord chercher le symbole
 * pour retrouver son id avant de demander le prix. On garde le premier
 * résultat (CoinGecko trie déjà par pertinence/capitalisation).
 */
export async function fetchCryptoPrice(symbolOrName) {
  const searchRes = await fetch(`${SEARCH_URL}?query=${encodeURIComponent(symbolOrName)}`);
  if (!searchRes.ok) {
    throw new Error(`Recherche CoinGecko impossible (${searchRes.status}).`);
  }
  const searchJson = await searchRes.json();
  const coin = searchJson.coins?.[0];
  if (!coin) {
    throw new Error(`Aucune cryptomonnaie trouvée pour "${symbolOrName}".`);
  }

  const priceRes = await fetch(
    `${PRICE_URL}?ids=${coin.id}&vs_currencies=usd,eur&include_24hr_change=true`
  );
  if (!priceRes.ok) {
    throw new Error(`Récupération du prix impossible (${priceRes.status}).`);
  }
  const priceJson = await priceRes.json();
  const data = priceJson[coin.id];
  if (!data) {
    throw new Error(`Aucune donnée de prix pour "${coin.name}".`);
  }

  return {
    name: coin.name,
    symbol: coin.symbol.toUpperCase(),
    usd: data.usd,
    eur: data.eur,
    change24hUsd: data.usd_24h_change,
  };
}
