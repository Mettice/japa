import { create } from 'zustand';
import { Card, Ending, GameStats, Stage, Character, City, GameConfig, GameEvent, MiniGameId, MiniGameResult, StatEffects } from '../types/game';
import rawCards from '../data/cards.json';
import rawEndings from '../data/endings.json';
import rawStages from '../data/stages.json';
import rawCharacters from '../data/characters.json';
import rawCities from '../data/cities.json';
import rawConfig from '../data/config.json';
import rawEvents from '../data/events.json';
import { sound } from '../utils/audio';
import { music } from '../utils/music';
import { track } from '../utils/analytics';
import { Life, DestinationId, LIFE_KEY, readLife, missionCards, missions, homeMissions, DELIVERY_WAGES } from '../game/journey';
import {
  GameData,
  RunState,
  Rng,
  activeEvent,
  createRun,
  dailyCityId,
  dailyNumber,
  dailySeed,
  mulberry32,
  randomSeed,
  currentCard,
  getCity,
  localizeCharacter,
  localizeStage,
  nextCard,
  resolveMiniGame,
  applyRunEffects,
  endingById,
  step,
} from '../engine/engine';

const data: GameData = {
  cards: rawCards as unknown as Card[],
  endings: rawEndings as unknown as Ending[],
  stages: rawStages as unknown as Stage[],
  characters: rawCharacters as unknown as Character[],
  cities: rawCities as unknown as City[],
  config: rawConfig as unknown as GameConfig,
};

const events = rawEvents as unknown as GameEvent[];
const journeyData = { ...data, endings: data.endings.filter(e => !['money_high', 'papers_high', 'morale_high'].includes(e.id)), config: { ...data.config, graceCards: 1 } };

// Each run owns a seeded RNG; it keeps dealing later stages from the same sequence
let runRng: Rng = Math.random;

export type RunMode = 'normal' | 'daily' | 'journey';

const LAST_CITY_KEY = 'bushfaller.lastCity';
const MUTED_KEY = 'bushfaller.muted';

const readMuted = (): boolean => {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
};

// Apply the remembered mute before any sound can play
const initiallyMuted = readMuted();
sound.enabled = !initiallyMuted;
music.setMuted(initiallyMuted);

export type AboutSection = 'top' | 'ads';

const readLastCity = (): string | null => {
  try {
    return localStorage.getItem(LAST_CITY_KEY);
  } catch {
    return null;
  }
};

interface GameState {
  deliveryPhase: 'briefing' | 'street' | 'payment' | 'conversation' | null;
  acceptDelivery: () => void;
  finishDelivery: () => void;
  collectDeliveryWages: () => void;
  life: Life | null;
  storageWarning: boolean;
  createLife: (name: string, cityId: string, destination: DestinationId) => void;
  startMission: () => void;
  // Run (null city = city picker is showing)
  cityId: string | null;
  city: City | null;
  lastCityId: string | null;
  mode: RunMode;
  seed: number;
  runId: number; // increments every run (daily runs repeat seeds, so seed can't key the UI)
  dailyNo: number | null; // "Daily Embassy #N" for daily runs
  stats: GameStats;
  currentStageIndex: number;
  stageCards: Card[];
  upcomingStageCards: Card[];
  currentCardIndex: number;
  cardsSwiped: number;
  activeEnding: Ending | null;
  pendingMiniGame: MiniGameId | null; // shown full-screen; cards wait until it resolves

  // Interactive UI
  dragDirection: 'left' | 'right' | null;
  soundEnabled: boolean;
  aboutOpen: AboutSection | null; // About overlay; doesn't interrupt a run
  playStyle: 'runner' | 'cards'; // 3D Japa Run (default) or the original swipe cards

  // Data lookups (stages are localised to the chosen city)
  stages: Stage[];
  cities: City[];
  event: GameEvent | null; // weekly event active today
  dailyCity: City; // city everyone plays in today's daily run

  // Actions
  getCurrentCard: () => Card | null;
  getNextCard: () => Card | null;
  getCurrentStage: () => Stage;
  getCharacter: (characterId: string) => Character | undefined;
  setDragDirection: (dir: 'left' | 'right' | null) => void;
  toggleSound: () => void;
  startRun: (cityId: string) => void;
  startDailyRun: () => void;
  applyChoice: (direction: 'left' | 'right') => void;
  finishMiniGame: (result: MiniGameResult) => void;
  applyRunEffects: (effects: StatEffects) => void;
  endRunWith: (endingId: string) => void;
  openAbout: (section?: AboutSection) => void;
  closeAbout: () => void;
  restartGame: () => void;
}

const NO_RUN = {
  deliveryPhase: null as GameState['deliveryPhase'],
  cityId: null,
  city: null,
  stats: { ...data.config.initialStats },
  currentStageIndex: 0,
  stageCards: [],
  upcomingStageCards: [],
  currentCardIndex: 0,
  cardsSwiped: 0,
  activeEnding: null,
  pendingMiniGame: null,
  dragDirection: null,
  stages: data.stages,
};

const beginRun = (cityId: string, mode: RunMode, seed: number) => {
  sound.playClick();
  music.play(); // inside the tap that started the run, so autoplay is allowed
  track({ name: 'run_start', city: cityId, mode });
  const city = getCity(data, cityId);
  runRng = mulberry32(seed);
  const event = activeEvent(events, new Date());
  useGameStore.setState({
    ...createRun(data, city.id, runRng, event?.modifiers),
    deliveryPhase: null,
    city,
    mode,
    seed,
    runId: useGameStore.getState().runId + 1,
    dailyNo: mode === 'daily' ? dailyNumber(data, new Date()) : null,
    event,
    stages: data.stages.map((stage) => localizeStage(stage, city, data)),
    dragDirection: null,
  });
};

const reportEnding = (run: RunState, mode: RunMode) =>
  track({
    name: 'ending_reached',
    ending: run.activeEnding!.id,
    stage: run.currentStageIndex + 1,
    cards: run.cardsSwiped,
    mode,
  });

const runFromState = (s: GameState): RunState => ({
  cityId: s.cityId!,
  stats: s.stats,
  currentStageIndex: s.currentStageIndex,
  stageCards: s.stageCards,
  upcomingStageCards: s.upcomingStageCards,
  currentCardIndex: s.currentCardIndex,
  cardsSwiped: s.cardsSwiped,
  activeEnding: s.activeEnding,
  pendingMiniGame: s.pendingMiniGame,
  modifiers: s.event?.modifiers,
});

export const useGameStore = create<GameState>((set, get) => ({
  ...NO_RUN,
  life: readLife(),
  storageWarning: false,
  acceptDelivery: () => {
    if (get().deliveryPhase !== 'briefing' || get().activeEnding) return;
    sound.playClick();
    set({ deliveryPhase: 'street' });
  },
  finishDelivery: () => {
    if (get().deliveryPhase !== 'street' || get().activeEnding) return;
    sound.playVictory();
    set({ deliveryPhase: 'payment', dragDirection: null });
  },
  collectDeliveryWages: () => {
    const state = get();
    if (state.deliveryPhase !== 'payment' || state.activeEnding) return;
    sound.playClick();
    set({ stats: { ...state.stats, money: Math.min(100, state.stats.money + DELIVERY_WAGES) }, deliveryPhase: 'conversation' });
  },
  createLife: (name, cityId, destination) => {
    if (!['canada', 'home'].includes(destination)) return;
    set({ life: { version: 1, name: name.trim().slice(0, 24) || 'Traveller', cityId: getCity(data, cityId).id, destination, chapter: 0, attempts: 0, stats: { ...data.config.initialStats }, helpedMama: null, trustedAgent: null, lastMessage: 'Boss: A delivery just came in. Ready to earn your first wages?' } });
  },
  startMission: () => {
    const life = get().life;
    if (!life || life.chapter >= 4) return;
    beginRun(life.cityId, 'journey', randomSeed());
    const city = getCity(data, life.cityId);
    const cards = missionCards(life).map(c => ({ ...c, stageId: data.stages[0].id }));
    set({ stats: { ...life.stats }, stageCards: cards, upcomingStageCards: [], currentCardIndex: 0, event: null, deliveryPhase: life.chapter === 0 ? 'briefing' : null,
      stages: data.stages.map((s, i) => i === 0 ? { ...localizeStage(s, city, data), name: (life.destination === 'home' ? homeMissions : missions)[life.chapter] } : localizeStage(s, city, data)) });
  },
  lastCityId: readLastCity(),
  soundEnabled: !initiallyMuted,
  playStyle: 'runner',
  aboutOpen: typeof location !== 'undefined' && location.hash === '#about' ? 'top' : null,
  cities: data.cities,
  mode: 'normal',
  seed: 0,
  runId: 0,
  dailyNo: null,
  event: activeEvent(events, new Date()),
  dailyCity: getCity(data, dailyCityId(data, new Date())),

  getCurrentCard: () => (get().cityId ? currentCard(runFromState(get())) : null),

  getNextCard: () => (get().cityId ? nextCard(runFromState(get())) : null),

  getCurrentStage: () => {
    const { stages, currentStageIndex } = get();
    return stages[currentStageIndex] || stages[0];
  },

  getCharacter: (characterId: string) => {
    const character = data.characters.find((char) => char.id === characterId);
    const { city } = get();
    return character && city ? localizeCharacter(character, city, data) : character;
  },

  setDragDirection: (dir) => {
    const { dragDirection: prev, activeEnding } = get();
    if (activeEnding) return;
    if (prev !== dir) {
      if (dir) {
        sound.playTick();
        sound.triggerHaptic('light');
      }
      set({ dragDirection: dir });
    }
  },

  toggleSound: () => {
    const newSoundState = !get().soundEnabled;
    sound.enabled = newSoundState;
    music.setMuted(!newSoundState);
    try {
      localStorage.setItem(MUTED_KEY, newSoundState ? '0' : '1');
    } catch {}
    set({ soundEnabled: newSoundState });
  },

  // Runner pickups / crashes: bars move like a card would, without advancing the deck
  applyRunEffects: (effects) => {
    const state = get();
    if (!state.cityId) return;
    if (state.deliveryPhase && state.deliveryPhase !== 'street') return;
    const run = runFromState(state);
    const next = applyRunEffects(state.mode === 'journey' ? journeyData : data, run, effects);
    if (next === run) return;
    if (next.activeEnding && !run.activeEnding) {
      reportEnding(next, state.mode);
      sound.playGameOver();
      sound.triggerHaptic('heavy');
    }
    set({ stats: next.stats, activeEnding: next.activeEnding });
  },

  endRunWith: (endingId) => {
    const state = get();
    if (!state.cityId || state.activeEnding) return;
    const ending = endingById(data, runFromState(state), endingId);
    if (!ending) return;
    sound.playVictory();
    track({ name: 'ending_reached', ending: ending.id, stage: state.currentStageIndex + 1, cards: state.cardsSwiped, mode: state.mode });
    set({ activeEnding: ending, dragDirection: null, pendingMiniGame: null });
  },

  openAbout: (section = 'top') => set({ aboutOpen: section }),
  closeAbout: () => {
    if (location.hash === '#about') history.replaceState(null, '', location.pathname + location.search);
    set({ aboutOpen: null });
  },

  startRun: (cityId: string) => {
    try {
      localStorage.setItem(LAST_CITY_KEY, cityId);
    } catch {}
    beginRun(cityId, 'normal', randomSeed());
    set({ lastCityId: cityId });
  },

  startDailyRun: () => {
    const now = new Date();
    beginRun(dailyCityId(data, now), 'daily', dailySeed(now));
  },

  applyChoice: (direction: 'left' | 'right') => {
    const state = get();
    if (!state.cityId) return;
    if (state.deliveryPhase && state.deliveryPhase !== 'conversation') return;

    const run = runFromState(state);
    const next = step(state.mode === 'journey' ? journeyData : data, run, direction, runRng);
    // Run already over or no card: ignore stray clicks/keypresses
    if (next === run) return;
    if (state.mode === 'journey' && state.life) {
      const card = currentCard(run);
      if (card?.id === 'mama_help') set({ life: { ...get().life!, helpedMama: direction === 'left' } });
      if (card?.id === 'agent_trust') set({ life: { ...get().life!, trustedAgent: direction === 'right' } });
      if (card?.id === 'mama_help' && next.currentStageIndex === 0) {
        next.stageCards = missionCards(get().life!);
      }
      if (!next.activeEnding && next.currentStageIndex > 0) {
        const final = state.life.chapter === 3;
        next.activeEnding = { ...endingById(data, next, 'zone_clear')!,
          title: final ? (state.life.destination === 'home' ? 'OPEN FOR BUSINESS!' : 'APPOINTMENT COMPLETE!') : 'ONE STEP CLOSER!',
          subtitle: final ? (state.life.destination === 'home' ? 'Your first order is ready. This is your beginning.' : 'Your application is in. The next chapter is still to come.') : 'Back home with a little more experience and a new chapter waiting.',
          description: 'Your progress has been added to your life at home.',
          shareTitle: final ? 'I finished my first Japa chapter!' : 'One step closer to my next life.',
          shareQuote: 'Small steps. Big dreams.', badge: 'JOURNEY MILESTONE', emoji: final ? '🎉' : '🏡',
        };
        next.currentStageIndex = 0;
      }
    }

    sound.playSwipe(direction);
    if (next.activeEnding) {
      reportEnding(next, state.mode);
      if (next.activeEnding.type === 'victory' || (state.mode === 'journey' && next.activeEnding.id === 'zone_clear')) sound.playVictory();
      else sound.playGameOver();
      sound.triggerHaptic('heavy');
    }

    set({ ...next, dragDirection: null });
  },

  finishMiniGame: (result: MiniGameResult) => {
    const state = get();
    if (!state.cityId) return;
    const run = runFromState(state);
    const next = resolveMiniGame(data, run, result);
    if (next === run) return;
    if (next.activeEnding) {
      reportEnding(next, state.mode);
      sound.playGameOver();
      sound.triggerHaptic('heavy');
    }
    set({ ...next, dragDirection: null });
  },

  // Back to the city picker; a new run always starts with a city choice
  restartGame: () => {
    sound.playClick();
    set({ ...NO_RUN });
  },
}));

// Settle once when an ending appears. Returning home or sharing cannot award progress twice.
useGameStore.subscribe((state, previous) => {
  if (state.activeEnding && !previous.activeEnding && state.mode === 'journey' && state.life) {
    const completed = state.activeEnding.id === 'zone_clear';
    const chapter = Math.min(4, state.life.chapter + (completed ? 1 : 0));
    const stats = { ...state.stats, morale: Math.max(40, state.stats.morale), familyPressure: Math.min(80, state.stats.familyPressure), money: Math.max(completed ? 0 : 15, state.stats.money), papers: Math.max(completed ? 0 : 15, state.stats.papers) };
    const lastMessage = !completed ? 'Boss: Rough day. I’ve arranged a small recovery advance and help with your papers. Rest up, then try again. Your milestones are safe.'
      : chapter === 1 ? 'Mama: I’m proud of you. Can we talk about a repair at home?'
      : chapter === 2 ? (state.life.helpedMama ? 'Mama: Thank you for helping. I packed food for your next trip.' : 'Mama: I understand your plans. Call me when you can.')
      : chapter === 3 ? (state.life.trustedAgent ? 'Boss: You paid that fee? Check every detail before tomorrow.' : 'Boss: Good move asking questions. You’re ready for tomorrow.')
      : state.life.destination === 'home' ? 'Mama: Your first business day! Look how far you’ve come.' : 'Mama: You made it through the appointment. We’ll wait for the decision together.';
    useGameStore.setState({ life: { ...state.life, stats, chapter, attempts: state.life.attempts + 1, lastMessage } });
  }
  if (state.life !== previous.life && state.life) {
    try { localStorage.setItem(LIFE_KEY, JSON.stringify(state.life)); }
    catch { if (!useGameStore.getState().storageWarning) useGameStore.setState({ storageWarning: true }); }
  }
});
