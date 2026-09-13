const EXCHANGE_RATE_URL = 'https://open.er-api.com/v6/latest';

/**
 * Convertit un montant entre deux devises via l'API gratuite open.er-api.com
 * (sans clé, ~160 devises couvertes — contrairement à l'API de la BCE
 * (Frankfurter) qui ne couvre que les devises majeures, celle-ci inclut
 * par exemple le FCFA/XAF).
 */
export async function convertCurrency(amount, from, to) {
  const fromCode = from.toUpperCase();
  const toCode = to.toUpperCase();

  const res = await fetch(`${EXCHANGE_RATE_URL}/${fromCode}`);
  if (!res.ok) {
    throw new Error(`Devise source inconnue : ${fromCode}.`);
  }

  const json = await res.json();
  if (json.result !== 'success') {
    throw new Error(`Devise source inconnue : ${fromCode}.`);
  }

  const rate = json.rates?.[toCode];
  if (rate == null) {
    throw new Error(`Devise cible inconnue : ${toCode}.`);
  }

  const date = new Date(json.time_last_update_utc).toLocaleDateString('fr-FR');
  return { amount, from: fromCode, to: toCode, result: amount * rate, date };
}
