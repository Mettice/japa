// Mulberry32: fast 32-bit seeded PRNG. Period = 2^32.
// Returns a function that produces numbers in [0, 1).
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a string to a 32-bit unsigned integer (djb2 variant).
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// Deterministic seed from today's UTC date.
// Everyone on the planet gets the same daily run.
export function dailySeed(): number {
  const d = new Date();
  const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return hashString(key);
}

// Seed from an arbitrary date string (for testing).
export function seedFromDate(dateStr: string): number {
  return hashString(dateStr);
}

// Random integer in [0, max) using the given rng.
export function randInt(rng: () => number, max: number): number {
  return Math.floor(rng() * max);
}

// Fisher–Yates shuffle using seeded rng.
export function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Pick one item from array using weighted probabilities.
// weights[i] corresponds to items[i]. All weights must be >= 0.
export function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return items[0];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
