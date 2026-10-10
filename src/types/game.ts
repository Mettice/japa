export type StatKey = 'money' | 'papers' | 'morale' | 'familyPressure';

export interface StatEffects {
  money?: number;
  papers?: number;
  morale?: number;
  familyPressure?: number;
}

export interface Choice {
  text: string;
  effects: StatEffects;
  setFlags?: string[];
  nextCardId?: string;
}

export interface Card {
  id: string;
  stageId: string;
  characterId: string;
  situation: string;
  leftChoice: Choice;
  rightChoice: Choice;
  image?: string;
  /** Scene the card happens in; shows that place's ad poster */
  location?: AdLocation;
  /** Omitted or empty = shared card dealt in every city */
  cities?: string[];
  /** Relative probability of being drawn (default 1) */
  weight?: number;
  /** Card is only drawn when ALL of these flags are set */
  requiresFlags?: string[];
  /** Card is never drawn when ANY of these flags are set */
  blocksFlags?: string[];
}

export interface Character {
  id: string;
  name: string;
  role: string;
  emoji: string;
  bgColor: string;
  textColor: string;
  borderColor?: string;
  image?: string;
  /** Per-city name/role swaps for shared characters */
  cities?: Record<string, { name?: string; role?: string }>;
}

export interface Stage {
  id: string;
  name: string;
  city: string;
  tagline: string;
  order: number;
  color: string;
  icon: string;
  /** Overrides GameConfig.cardsPerStage for this stage */
  cardsPerStage?: number;
  /** Played on entering the stage, before its first card */
  miniGame?: MiniGameId;
}

export type MiniGameId = 'queue' | 'interview' | 'winter';

/** score is normalised 0..1; penalties counts things like bills tapped */
export interface MiniGameResult {
  score: number;
  penalties?: number;
}

export interface Ending {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  condition: string;
  type: 'death' | 'victory' | 'special';
  statKey?: StatKey;
  statValue?: 0 | 100;
  emoji: string;
  badge: string;
  shareTitle: string;
  shareQuote: string;
  rarity: 'common' | 'rare' | 'legendary';
}

export interface GameStats {
  money: number;
  papers: number;
  morale: number;
  familyPressure: number;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  position: 'prefix' | 'suffix';
  perUsd: number;
  /** Use 150k / 12m style for large numbers */
  compact?: boolean;
}

export interface City {
  id: string;
  name: string;
  country: string;
  flag: string;
  tagline: string;
  currency: Currency;
  /** Values for {market}, {airport}, {embassyGate}, etc. placeholders */
  places: Record<string, string>;
}

/** Scene a card happens in; each maps to one ad placement */
export type AdLocation = 'cyber_cafe' | 'embassy' | 'agency';

export interface GameConfig {
  cardsPerStage: number;
  /** No ending can trigger during the first N cards: bars are held inside [graceFloor, 100 - graceFloor] */
  graceCards: number;
  graceFloor: number;
  /** Largest single change to any bar while in stage 1 */
  stageOneMaxHit: number;
  /** Public URL printed on share cards; empty = VITE_SHARE_URL, then the page's own origin */
  shareUrl: string;
  adsContact: { label: string; url: string };
  dailyEpoch: string; // YYYY-MM-DD (UTC) of Daily Embassy #1
  initialStats: GameStats;
}

// --- Weekly world events ---
export interface WorldEvent {
  id: string;
  title: string;
  bannerText: string;
  /** Multipliers on stat effects, e.g. { "papers": 0.7 } */
  modifiers: Partial<Record<StatKey, number>>;
  startDate: string; // ISO date
  endDate: string;   // ISO date
}

// --- In-game ad slots ---
export interface AdSlot {
  id: string;
  placement: 'cyber_cafe_poster' | 'embassy_board' | 'agency_flyer';
  /** WebP under /public/ads */
  image?: string;
  text: string;
  url: string;
  active: boolean;
}

// --- Start profiles ---
export interface StartProfile {
  id: string;
  name: string;
  description: string;
  stats: GameStats;
}

// Weekly world event; modifiers scale choice effects per bar (e.g. papers: 0.7)
export interface GameEvent {
  id: string;
  title: string;
  banner: string;
  emoji: string;
  modifiers: Partial<Record<StatKey, number>>;
  startDate: string; // inclusive, YYYY-MM-DD (UTC)
  endDate: string; // inclusive, YYYY-MM-DD (UTC)
}
