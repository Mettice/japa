// Pure game rules shared by the zustand store and scripts/simulate.ts.
// No runtime imports so Node can run it directly (type-only imports are stripped).
import type { Card, Character, City, Ending, GameConfig, GameEvent, GameStats, MiniGameId, MiniGameResult, Stage, StatEffects, StatKey } from '../types/game';

export interface GameData {
  cards: Card[];
  endings: Ending[];
  stages: Stage[];
  characters: Character[];
  cities: City[];
  config: GameConfig;
}

export interface RunState {
  cityId: string;
  stats: GameStats;
  currentStageIndex: number;
  stageCards: Card[];
  upcomingStageCards: Card[]; // pre-dealt so the peek card matches what is actually dealt
  currentCardIndex: number;
  cardsSwiped: number;
  activeEnding: Ending | null;
  pendingMiniGame: MiniGameId | null; // blocks cards until resolved
  modifiers?: GameEvent['modifiers']; // from the weekly event active when the run started
}

export type Rng = () => number;

// ---------- Seeds ----------

export const mulberry32 = (seed: number): Rng => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const utcDateKey = (date: Date) => date.toISOString().slice(0, 10);

// Same UTC day → same seed for everyone (FNV-1a over "YYYY-MM-DD")
export const dailySeed = (date: Date): number => {
  let h = 0x811c9dc5;
  for (const ch of utcDateKey(date)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

// The daily run also fixes the city so every player gets the identical deck
export const dailyCityId = (data: GameData, date: Date): string =>
  data.cities[dailySeed(date) % data.cities.length].id;

// Daily Embassy #1 is the epoch day; numbers count up one per UTC day
export const dailyNumber = (data: GameData, date: Date): number =>
  Math.floor((Date.parse(utcDateKey(date)) - Date.parse(data.config.dailyEpoch)) / 86_400_000) + 1;

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

export const activeEvent = (events: GameEvent[], date: Date): GameEvent | null => {
  const today = utcDateKey(date);
  return events.find((e) => e.startDate <= today && today <= e.endDate) || null;
};

export const STAT_KEYS: StatKey[] = ['money', 'papers', 'morale', 'familyPressure'];

// ---------- Localisation ----------

const roundSig = (v: number, digits: number) => {
  if (v === 0) return 0;
  const p = Math.pow(10, digits - Math.ceil(Math.log10(Math.abs(v))));
  return Math.round(v * p) / p;
};

const trimNum = (v: number) => String(Number(v.toFixed(2)));

// usd is the canonical amount used in card text: {$100} → ₦150k / 60,000 FCFA / GH₵1,500
export const formatMoney = (usd: number, city: City): string => {
  const { currency } = city;
  const v = roundSig(usd * currency.perUsd, 3);
  let body: string;
  if (v >= 1e6) body = `${trimNum(v / 1e6)}m`;
  else if (v >= 1e3 && currency.compact) body = `${trimNum(v / 1e3)}k`;
  else body = v.toLocaleString('en-US', { maximumFractionDigits: v < 100 ? 2 : 0 });
  return currency.position === 'prefix' ? `${currency.symbol}${body}` : `${body} ${currency.symbol}`;
};

export const getCity = (data: GameData, cityId: string): City =>
  data.cities.find((c) => c.id === cityId) || data.cities[0];

export const localizeCharacter = (character: Character, city: City, data: GameData): Character => {
  const override = character.cities?.[city.id] || {};
  return {
    ...character,
    name: override.name ?? character.name,
    role: localizeText(override.role ?? character.role, city, data),
  };
};

// Placeholders: {$100} money in USD, {@chidi} a character's local name, {market} a city field
export const localizeText = (text: string, city: City, data: GameData): string =>
  text
    .replace(/\{\$([\d.]+)\}/g, (_, usd) => formatMoney(Number(usd), city))
    .replace(/\{@(\w+)\}/g, (match, id) => {
      const character = data.characters.find((c) => c.id === id);
      return character ? character.cities?.[city.id]?.name ?? character.name : match;
    })
    .replace(/\{(\w+)\}/g, (match, key) => {
      if (key === 'cityName') return city.name;
      if (key === 'country') return city.country;
      if (key === 'currencyName') return city.currency.name;
      return city.places[key] ?? match;
    });

const localizeCard = (card: Card, city: City, data: GameData): Card => ({
  ...card,
  situation: localizeText(card.situation, city, data),
  leftChoice: { ...card.leftChoice, text: localizeText(card.leftChoice.text, city, data) },
  rightChoice: { ...card.rightChoice, text: localizeText(card.rightChoice.text, city, data) },
});

export const localizeEnding = (ending: Ending, city: City, data: GameData): Ending => ({
  ...ending,
  title: localizeText(ending.title, city, data),
  subtitle: localizeText(ending.subtitle, city, data),
  description: localizeText(ending.description, city, data),
  shareTitle: localizeText(ending.shareTitle, city, data),
  shareQuote: localizeText(ending.shareQuote, city, data),
});

export const localizeStage = (stage: Stage, city: City, data: GameData): Stage => ({
  ...stage,
  city: localizeText(stage.city, city, data),
  tagline: localizeText(stage.tagline, city, data),
});

// ---------- Dealing ----------

const shuffle = <T>(items: T[], rng: Rng): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export const cardsPerStage = (stage: Stage, data: GameData) => stage.cardsPerStage ?? data.config.cardsPerStage;

export const stagePool = (data: GameData, stageId: string, cityId: string): Card[] =>
  data.cards.filter((c) => c.stageId === stageId && (!c.cities || c.cities.includes(cityId)));

// Deal N cards for a stage; guarantees at least one city-specific card when the city has one here
export const dealStage = (data: GameData, stageIndex: number, cityId: string, rng: Rng): Card[] => {
  const stage = data.stages[stageIndex];
  if (!stage) return [];
  const n = cardsPerStage(stage, data);
  const pool = stagePool(data, stage.id, cityId);
  const local = shuffle(pool.filter((c) => c.cities), rng);
  const rest = shuffle(pool.filter((c) => c !== local[0]), rng);
  const picked = (local.length ? [local[0], ...rest] : rest).slice(0, n);
  const city = getCity(data, cityId);
  return shuffle(picked, rng).map((card) => localizeCard(card, city, data));
};

// ---------- Rules ----------

// Weekly event multipliers (e.g. papers ×0.7), rounded to whole points
export const scaleEffects = (effects: StatEffects, modifiers: GameEvent['modifiers'] = {}): StatEffects => {
  const out: StatEffects = {};
  for (const key of STAT_KEYS) {
    const delta = Math.round((effects[key] || 0) * (modifiers[key] ?? 1));
    if (delta) out[key] = delta;
  }
  return out;
};

export const applyEffects = (stats: GameStats, effects: StatEffects, modifiers: GameEvent['modifiers'] = {}): GameStats => {
  const scaled = scaleEffects(effects, modifiers);
  const next = { ...stats };
  for (const key of STAT_KEYS) {
    next[key] = Math.max(0, Math.min(100, stats[key] + (scaled[key] || 0)));
  }
  return next;
};

// First bar (in STAT_KEYS order) to hit 0 or 100 decides the ending
export const findEnding = (stats: GameStats, endings: Ending[]): Ending | null => {
  for (const key of STAT_KEYS) {
    const ending = stats[key] <= 0 ? endings.find(e => e.id === `${key}_low`)
      : stats[key] >= 100 ? endings.find(e => e.id === `${key}_high`) : undefined;
    if (ending) return ending;
  }
  return null;
};

export const createRun = (
  data: GameData,
  cityId: string,
  rng: Rng = Math.random,
  modifiers?: GameEvent['modifiers'],
): RunState => ({
  cityId,
  modifiers,
  stats: { ...data.config.initialStats },
  currentStageIndex: 0,
  stageCards: dealStage(data, 0, cityId, rng),
  upcomingStageCards: dealStage(data, 1, cityId, rng),
  currentCardIndex: 0,
  cardsSwiped: 0,
  activeEnding: null,
  pendingMiniGame: data.stages[0]?.miniGame ?? null,
});

export const currentCard = (run: RunState): Card | null => run.stageCards[run.currentCardIndex] || null;

export const nextCard = (run: RunState): Card | null =>
  run.stageCards[run.currentCardIndex + 1] || run.upcomingStageCards[0] || null;

// Returns the same object when the choice is ignored (run over / no card)
// Early-run safety net: stage 1 hits are capped, and nothing can kill you during the
// first graceCards cards (bars are held just inside the deadly edges instead)
const landEffects = (data: GameData, run: RunState, effects: StatEffects, cardsSwiped: number): GameStats => {
  const { graceCards, graceFloor, stageOneMaxHit } = data.config;
  const scaled = scaleEffects(effects, run.modifiers);
  if (run.currentStageIndex === 0) {
    for (const key of STAT_KEYS) {
      if (scaled[key]) scaled[key] = Math.max(-stageOneMaxHit, Math.min(stageOneMaxHit, scaled[key]!));
    }
  }
  const stats = applyEffects(run.stats, scaled);
  if (cardsSwiped <= graceCards) {
    for (const key of STAT_KEYS) stats[key] = Math.max(graceFloor, Math.min(100 - graceFloor, stats[key]));
  }
  return stats;
};

export const step = (data: GameData, run: RunState, direction: 'left' | 'right', rng: Rng = Math.random): RunState => {
  const card = currentCard(run);
  if (run.activeEnding || run.pendingMiniGame || !card) return run;

  const choice = direction === 'left' ? card.leftChoice : card.rightChoice;
  const cardsSwiped = run.cardsSwiped + 1;
  const stats = landEffects(data, run, choice.effects, cardsSwiped);
  const city = getCity(data, run.cityId);

  const death = findEnding(stats, data.endings);
  if (death) {
    return { ...run, stats, cardsSwiped, activeEnding: localizeEnding(death, city, data) };
  }

  if (run.currentCardIndex + 1 < run.stageCards.length) {
    return { ...run, stats, cardsSwiped, currentCardIndex: run.currentCardIndex + 1 };
  }

  const nextStageIndex = run.currentStageIndex + 1;
  if (nextStageIndex < data.stages.length) {
    return {
      ...run,
      stats,
      cardsSwiped,
      currentStageIndex: nextStageIndex,
      stageCards: run.upcomingStageCards,
      upcomingStageCards: dealStage(data, nextStageIndex + 1, run.cityId, rng),
      currentCardIndex: 0,
      pendingMiniGame: data.stages[nextStageIndex].miniGame ?? null,
    };
  }

  const victory = data.endings.find((e) => e.type === 'victory') || data.endings[0];
  return { ...run, stats, cardsSwiped, activeEnding: localizeEnding(victory, city, data) };
};

// ---------- Mini-games ----------

const round5 = (v: number) => Math.round(v / 5) * 5;

// Score (0..1) → bar deltas. Kept here so the balance sim plays mini-games too.
export const miniGameEffects = (id: MiniGameId, { score, penalties = 0 }: MiniGameResult): StatEffects => {
  const s = Math.max(0, Math.min(1, score));
  const effects: StatEffects =
    id === 'queue'
      ? { papers: round5(-15 + 20 * s), morale: round5(-10 + 15 * s) }
      : id === 'interview'
        ? { papers: s >= 1 ? 15 : round5(-20 * (1 - s)) }
        : { morale: round5(-15 + 25 * s), money: -Math.min(15, 5 * penalties) };
  for (const key of STAT_KEYS) if (!effects[key]) delete effects[key];
  return effects;
};

// Seeded per stage so daily runs get identical mini-games
export const miniGameSeed = (runSeed: number, stageIndex: number) => (runSeed ^ Math.imul(stageIndex + 1, 0x9e3779b9)) >>> 0;

export const resolveMiniGame = (data: GameData, run: RunState, result: MiniGameResult): RunState => {
  if (!run.pendingMiniGame || run.activeEnding) return run;
  const stats = landEffects(data, run, miniGameEffects(run.pendingMiniGame, result), run.cardsSwiped);
  const death = findEnding(stats, data.endings);
  return {
    ...run,
    stats,
    pendingMiniGame: null,
    activeEnding: death ? localizeEnding(death, getCity(data, run.cityId), data) : null,
  };
};

// Effects from outside the card deck (runner pickups, crashes). Same safety net and
// ending checks as a card, but doesn't count as a card.
export const applyRunEffects = (data: GameData, run: RunState, effects: StatEffects): RunState => {
  if (run.activeEnding) return run;
  const stats = landEffects(data, run, effects, run.cardsSwiped);
  const death = findEnding(stats, data.endings);
  return { ...run, stats, activeEnding: death ? localizeEnding(death, getCity(data, run.cityId), data) : null };
};

export const endingById = (data: GameData, run: RunState, id: string): Ending | null => {
  const ending = data.endings.find((e) => e.id === id);
  return ending ? localizeEnding(ending, getCity(data, run.cityId), data) : null;
};
