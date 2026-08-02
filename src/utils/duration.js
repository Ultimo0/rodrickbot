const UNITS = {
  s: 1000,
  sec: 1000,
  secs: 1000,
  seconde: 1000,
  secondes: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hrs: 60 * 60 * 1000,
  heure: 60 * 60 * 1000,
  heures: 60 * 60 * 1000,
};

export function parseDuration(input) {
  if (!input) return null;
  const match = /^(\d+)\s*([a-zA-Zé]+)$/.exec(input.trim());
  if (!match) return null;

  const [, amountStr, unitRaw] = match;
  const amount = Number(amountStr);
  const unit = unitRaw.toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0 || !(unit in UNITS)) return null;

  return amount * UNITS[unit];
}

export function formatDuration(ms) {
  if (ms % UNITS.h === 0) return `${ms / UNITS.h} h`;
  if (ms % UNITS.min === 0) return `${ms / UNITS.min} min`;
  return `${ms / UNITS.s} s`;
}