import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/audio', () => ({ sound: { enabled: true, playClick() {}, playSwipe() {}, playTick() {}, playVictory() {}, playGameOver() {}, triggerHaptic() {} } }));
vi.mock('../utils/music', () => ({ music: { setMuted() {}, play() {} } }));
vi.mock('../utils/analytics', () => ({ track() {} }));

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) });
const { useGameStore } = await import('../store/gameStore');
const { readLife, LIFE_KEY } = await import('./journey');
const get = useGameStore.getState;

beforeEach(() => { memory.clear(); get().restartGame(); useGameStore.setState({ life: null, storageWarning: false }); });

describe('saved life and connected missions', () => {
  it.each(['canada', 'home'] as const)('completes all four %s missions once and restores saved progress', destination => {
    get().createLife('Ada', 'lagos', destination);
    for (let chapter = 0; chapter < 4; chapter++) {
      get().startMission();
      expect(get().mode).toBe('journey');
      expect(get().getCurrentCard()?.id).toBe(['first_call', 'mama_help', 'agent_trust', 'appointment'][chapter]);
      if (chapter === 0) { get().acceptDelivery(); get().finishDelivery(); get().collectDeliveryWages(); }
      for (let choice = 0; choice < (chapter === 0 ? 2 : 3); choice++) get().applyChoice('left');
      expect(get().activeEnding?.id).toBe('zone_clear');
      expect(get().life?.chapter).toBe(chapter + 1);
      get().applyChoice('right');
      get().restartGame();
      expect(get().life?.attempts).toBe(chapter + 1);
    }
    expect(readLife()).toEqual(get().life);
    expect(get().life?.helpedMama).toBe(true);
    expect(get().life?.trustedAgent).toBe(false);
    get().startMission();
    expect(get().cityId).toBeNull();
  });
  it('remembers Mama’s choice within the same mission', () => {
    get().createLife('Ada', 'lagos', 'canada');
    useGameStore.setState({ life: { ...get().life!, chapter: 1 } });
    get().startMission(); get().applyChoice('left'); get().applyChoice('left');
    expect(get().getCurrentCard()?.situation).toContain('remembers your help');
  });
  it('retains milestones after failure and supplies a playable recovery', () => {
    get().createLife('Ada', 'lagos', 'canada');
    useGameStore.setState({ life: { ...get().life!, chapter: 1 } }); get().startMission();
    get().applyChoice('left'); get().applyChoice('left');
    for (let hit = 0; hit < 3; hit++) get().applyRunEffects({ money: -100 });
    expect(get().life?.chapter).toBe(1);
    expect(get().life?.attempts).toBe(1);
    expect(get().life!.stats.money).toBeGreaterThan(0);
    get().restartGame(); get().startMission();
    expect(get().getCurrentCard()?.id).toBe('mama_help');
  });
  it('does not award story progress from a daily challenge', () => {
    get().createLife('Ada', 'lagos', 'canada'); const life = get().life;
    get().startDailyRun(); get().endRunWith('zone_clear'); get().restartGame();
    expect(get().life).toEqual(life);
  });
  it('high preparation does not hide a family-pressure setback', () => {
    get().createLife('Ada', 'lagos', 'canada');
    useGameStore.setState({ life: { ...get().life!, chapter: 1 } }); get().startMission();
    get().applyChoice('left'); get().applyChoice('left');
    useGameStore.setState({ stats: { money: 100, papers: 100, morale: 60, familyPressure: 90 } });
    get().applyRunEffects({ familyPressure: 20 });
    expect(get().activeEnding?.id).toBe('familyPressure_high');
    expect(get().life?.chapter).toBe(1);
  });
  it('requires delivery, pays once, and completes only after the conversation', () => {
    get().createLife('Ada', 'lagos', 'canada'); get().startMission();
    get().finishDelivery(); get().collectDeliveryWages(); get().applyChoice('left');
    expect(get().deliveryPhase).toBe('briefing'); expect(get().stats.money).toBe(40);
    get().acceptDelivery(); get().applyChoice('right'); expect(get().currentCardIndex).toBe(0);
    get().finishDelivery(); expect(get().deliveryPhase).toBe('payment');
    get().collectDeliveryWages(); get().collectDeliveryWages();
    expect(get().stats.money).toBe(52); expect(get().life?.chapter).toBe(0);
    get().applyRunEffects({ money: 20 }); expect(get().stats.money).toBe(52);
    get().applyChoice('left'); get().applyChoice('left'); get().restartGame();
    expect(get().life?.chapter).toBe(1); expect(get().life?.stats.money).toBe(52);
    expect(get().deliveryPhase).toBeNull();
  });
  it('abandoning an unfinished delivery does not save or duplicate its wage', () => {
    get().createLife('Ada', 'lagos', 'canada'); get().startMission(); get().acceptDelivery();
    get().finishDelivery(); get().collectDeliveryWages(); get().restartGame(); get().startMission();
    expect(get().deliveryPhase).toBe('briefing'); expect(get().stats.money).toBe(40);
    expect(get().life?.chapter).toBe(0);
    get().startDailyRun(); expect(get().deliveryPhase).toBeNull();
  });
  it('rejects unavailable routes and corrupted saves', () => {
    get().createLife('Ada', 'lagos', 'uk'); expect(get().life).toBeNull();
    memory.set(LIFE_KEY, '{broken'); expect(readLife()).toBeNull();
    get().createLife('Ada', 'lagos', 'canada');
    memory.set(LIFE_KEY, JSON.stringify({ ...get().life, chapter: -1 })); expect(readLife()).toBeNull();
  });
  it('keeps a life usable when browser storage fails', () => {
    const storage = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('storage unavailable'); };
    try { get().createLife('Ada', 'lagos', 'canada'); expect(get().storageWarning).toBe(true); expect(get().life?.name).toBe('Ada'); }
    finally { localStorage.setItem = storage; }
  });
});
