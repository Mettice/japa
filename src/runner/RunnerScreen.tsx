import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Home, Volume2, VolumeX } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { Bars } from '../components/Bars';
import { Portrait } from '../components/SwipeCard';
import { miniGameSeed, mulberry32 } from '../engine/engine';
import { StatEffects } from '../types/game';
import { sound } from '../utils/audio';
import { useMediaQuery } from '../utils/useMediaQuery';
import { HitKind, JapaRunWorld, PickupKind } from './world';
import { zoneDressing } from './signs';
import { DELIVERY_DISTANCE } from '../game/journey';

// Prototype covers the first two stages; reaching stage 3 ends the run
const PROTOTYPE_STAGES = 2;

// All runner tuning in one place
const PICKUP_EFFECTS: Record<PickupKind, StatEffects> = {
  cash: { money: 1 },
  papers: { papers: 3 },
  jollof: { morale: 3 },
  phoneoff: { familyPressure: -6 },
};
const HIT_EFFECTS: Record<HitKind, StatEffects> = {
  barrier: { morale: -5 },
  banner: { morale: -5 },
  danfo: { money: -5, morale: -4 },
  bubble: { familyPressure: 6 },
  pillar: { morale: -4 },
};
const FARE_EVERY_M = 30; // Lagos no dey free: transport fare drains cash as you go

const PICKUP_TOAST: Partial<Record<PickupKind, string>> = { papers: '+📄 Papers', jollof: '+🙂 Jollof!', phoneoff: '📵 Family muted' };
const HIT_TOAST: Record<HitKind, string> = {
  barrier: 'Ouch! 🤕',
  banner: 'Bonk! 🤕',
  danfo: 'Danfo! Pay for mirror 💸',
  bubble: 'Family message 📲',
  pillar: 'You froze! 😬',
};

interface Toast {
  id: number;
  text: string;
  good: boolean;
}

export default function RunnerScreen() {
  const store = useGameStore();
  const { city, currentStageIndex, stages, activeEnding, aboutOpen, mode, seed, soundEnabled, toggleSound, restartGame } = store;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<JapaRunWorld | null>(null);
  const [phase, setPhase] = useState<'ready' | 'countdown' | 'running'>('ready');
  const [count, setCount] = useState(3);
  const [meters, setMeters] = useState(0);
  const [deciding, setDeciding] = useState(false);
  const [lane, setLane] = useState<-1 | 0 | 1>(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [stageBanner, setStageBanner] = useState<number | null>(null);
  const lastFareAt = useRef(0);
  // Mouse/trackpad users get keyboard hints instead of swipe hints
  const hasMouse = useMediaQuery('(pointer: fine)');
  const delivering = store.deliveryPhase === 'street';

  // Street text comes from src/data/signs.json (no code needed to write new jokes)
  const zones = useMemo(
    () => ({
      market: zoneDressing('market', city),
      documents: zoneDressing('documents', city),
      appointment: zoneDressing('appointment', city),
      business: zoneDressing('business', city),
    }),
    [city],
  );
  const delivered = useRef(false);

  const toast = (text: string, good: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, good }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 1100);
  };

  // Build the world once per run
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const get = useGameStore.getState;
    const world = new JapaRunWorld(canvas, {
      // Seeded track: the daily run gives everyone the same street
      rng: mulberry32(miniGameSeed(get().seed, 99)),
      zone: () => {
        const s = get();
        if (s.mode === 'journey' && s.life) {
          if (s.life.chapter === 3) return s.life.destination === 'home' ? zones.business : zones.appointment;
          return s.life.chapter === 0 ? zones.market : zones.documents;
        }
        return s.currentStageIndex === 0 ? zones.market : zones.documents;
      },
      nextGate: () => {
        const s = get();
        if (s.deliveryPhase === 'street') return null;
        const card = s.getCurrentCard();
        if (!card || s.currentStageIndex >= PROTOTYPE_STAGES) return null;
        const who = s.getCharacter(card.characterId);
        return {
          left: card.leftChoice.text,
          right: card.rightChoice.text,
          name: who?.name ?? '',
          emoji: who?.emoji ?? '❓',
          color: who?.bgColor ?? '#2A3E80',
        };
      },
      onPickup: (kind) => {
        get().applyRunEffects(PICKUP_EFFECTS[kind]);
        if (kind === 'cash') sound.playTick();
        else sound.playClick();
        if (PICKUP_TOAST[kind]) toast(PICKUP_TOAST[kind]!, true);
      },
      onHit: (kind) => {
        get().applyRunEffects(HIT_EFFECTS[kind]);
        sound.playSwipe('left');
        sound.triggerHaptic('medium');
        toast(HIT_TOAST[kind], false);
      },
      onGateApproach: (approaching) => {
        setDeciding(approaching);
        if (!approaching) get().setDragDirection(null);
      },
      onLane: (l) => {
        setLane(l);
        sound.playTick();
      },
      onGate: (side, froze) => {
        get().applyChoice(side);
        if (froze) toast('Mama chose for you 😬', false);
        setDeciding(false);
      },
      onDistance: (m) => {
        setMeters(m);
        if (get().deliveryPhase === 'street') {
          // Arrived: coin shower first, then hand over to the payment screen
          if (m >= DELIVERY_DISTANCE && !delivered.current) {
            delivered.current = true;
            worldRef.current?.celebrate();
            sound.playVictory();
            sound.triggerHaptic('medium');
            setTimeout(() => get().finishDelivery(), 900);
          }
          return;
        }
        // Transport fare
        if (m - lastFareAt.current >= FARE_EVERY_M) {
          lastFareAt.current = m;
          get().applyRunEffects({ money: -1 });
        }
      },
    });
    worldRef.current = world;
    return () => {
      world.dispose();
      worldRef.current = null;
    };
    // One world per run; the seed identifies the run
  }, [seed]);

  // While a gate is near, the preview dots follow the door you're lined up with
  useEffect(() => {
    if (!deciding) return;
    useGameStore.getState().setDragDirection(lane < 0 ? 'left' : lane > 0 ? 'right' : null);
  }, [deciding, lane]);

  // Pause for endings, About, etc.
  useEffect(() => {
    worldRef.current?.setPaused(phase !== 'running' || !!activeEnding || !!aboutOpen);
  }, [phase, activeEnding, aboutOpen]);

  // Stage changes: title banner, and the prototype finish line
  const lastStage = useRef(currentStageIndex);
  useEffect(() => {
    if (currentStageIndex === lastStage.current) return;
    lastStage.current = currentStageIndex;
    if (currentStageIndex >= (mode === 'journey' ? 1 : PROTOTYPE_STAGES)) {
      useGameStore.getState().endRunWith('zone_clear');
      return;
    }
    setStageBanner(currentStageIndex);
    setTimeout(() => setStageBanner(null), 1800);
  }, [currentStageIndex]);

  // 3-2-1
  useEffect(() => {
    if (phase !== 'countdown') return;
    let n = 3;
    setCount(n);
    sound.playTick();
    const t = setInterval(() => {
      n--;
      setCount(n);
      if (n > 0) sound.playTick();
      if (n === 0) {
        sound.playClick();
        worldRef.current?.start();
      }
      if (n < 0) {
        clearInterval(t);
        setPhase('running');
      }
    }, 600);
    return () => clearInterval(t);
  }, [phase]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const w = worldRef.current;
      if (!w) return;
      if (e.key === 'ArrowLeft' || e.key === 'a') w.moveLeft();
      else if (e.key === 'ArrowRight' || e.key === 'd') w.moveRight();
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') w.jump();
      else if (e.key === 'ArrowDown' || e.key === 's') w.slide();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Swipes: fire as soon as the finger has travelled far enough, not on release
  const swipe = useRef<{ x: number; y: number; fired: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, fired: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = swipe.current;
    const w = worldRef.current;
    if (!s || s.fired || !w) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
    s.fired = true;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) w.moveLeft();
      else w.moveRight();
    } else if (dy < 0) w.jump();
    else w.slide();
  };
  const onPointerUp = () => {
    swipe.current = null;
  };

  const card = store.getCurrentCard();
  const character = card ? store.getCharacter(card.characterId) : undefined;
  const stage = stages[currentStageIndex];

  return (
    <div className="absolute inset-0 flex flex-col bg-navy-950">
      {/* HUD */}
      {/* Phone/tablet: bar across the top. Desktop (lg): floating panel in the top-left corner,
          so the 3D view gets the whole window */}
      <header className="relative z-10 flex-shrink-0 bg-navy-900/95 border-b-4 border-ink lg:absolute lg:top-4 lg:left-4 lg:z-20 lg:w-[400px] lg:rounded-2xl lg:border-4 lg:shadow-comic-lg lg:backdrop-blur-sm">
        <Bars />
        <div className="flex items-center gap-2 px-3 pb-2 max-w-md mx-auto w-full">
          {city && <span className="text-lg leading-none flag-emoji">{city.flag}</span>}
          <span className="min-w-0 flex-1 font-title text-[15px] text-cream leading-tight truncate">
            Stage {currentStageIndex + 1} · {stage?.name}
            {mode === 'daily' && <span className="ml-1.5 text-[10px] font-black uppercase bg-sun text-ink rounded px-1 py-0.5 align-middle">Daily</span>}
          </span>
          <span className="font-title text-lg text-sun tabular-nums">{delivering ? `${Math.max(0, DELIVERY_DISTANCE - meters)}m left` : `${meters}m`}</span>
          <button
            onClick={toggleSound}
            aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
            className="press w-11 h-11 flex items-center justify-center bg-navy-700 text-cream rounded-xl border-[3px] border-ink shadow-comic-sm"
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} className="opacity-60" />}
          </button>
          <button
            onClick={restartGame}
            aria-label="Back to start"
            className="press w-11 h-11 flex items-center justify-center bg-navy-700 text-cream rounded-xl border-[3px] border-ink shadow-comic-sm"
          >
            <Home size={18} />
          </button>
        </div>
      </header>

      {/* 3D view + input surface */}
      <div
        className="relative flex-1 min-h-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

        {/* Toasts */}
        <div className="absolute top-[38%] inset-x-0 flex flex-col items-center gap-1 pointer-events-none">
          <AnimatePresence>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                initial={{ y: 10, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -10, opacity: 0 }}
                className={`px-3 py-1 rounded-xl border-[3px] border-ink font-title text-base shadow-comic-sm ${
                  t.good ? 'bg-leaf text-ink' : 'bg-chili text-cream'
                }`}
              >
                {t.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Stage banner */}
        <AnimatePresence>
          {stageBanner !== null && stages[stageBanner] && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.15, opacity: 0 }}
              className="absolute inset-x-8 top-1/4 pointer-events-none lg:inset-x-[calc(50%-240px)]"
            >
              <div className="bg-sun border-4 border-ink rounded-3xl shadow-comic-lg px-4 py-3 text-center -rotate-2">
                <div className="text-4xl leading-none">{stages[stageBanner].icon}</div>
                <div className="font-title text-ink/60 text-sm uppercase tracking-widest mt-1">Stage {stageBanner + 1}</div>
                <div className="font-title text-ink text-3xl leading-none">{stages[stageBanner].name}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Decision panel: the card, read in slow motion. Sits at the top so the runner
            and the doors stay visible below it. */}
        <AnimatePresence>
          {deciding && card && character && (
            <motion.div
              initial={{ y: '-120%' }}
              animate={{ y: 0 }}
              exit={{ y: '-120%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              className="absolute top-2 inset-x-3 pointer-events-none md:inset-x-[calc(50%-260px)] lg:top-4 lg:right-4 lg:left-auto lg:w-[420px]"
            >
              <div className="bg-cream border-4 border-ink rounded-3xl shadow-comic-lg p-3 lg:p-4">
                <div className="flex items-center gap-2.5">
                  <Portrait character={character} size={40} />
                  <div className="min-w-0">
                    <div className="font-title text-lg text-ink leading-none">{character.name}</div>
                    <div className="text-[10px] font-black uppercase text-ink/50 truncate">{character.role}</div>
                  </div>
                </div>
                <p className="text-ink font-extrabold text-[13px] leading-snug mt-1.5 lg:text-[15px]">{card.situation}</p>
                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  <div
                    className={`rounded-xl border-[3px] border-ink px-2 py-1.5 text-[12px] font-black leading-tight transition-transform ${
                      lane < 0 ? 'bg-chili text-cream scale-105' : 'bg-chili/25 text-ink'
                    }`}
                  >
                    ⬅ {card.leftChoice.text}
                  </div>
                  <div
                    className={`rounded-xl border-[3px] border-ink px-2 py-1.5 text-[12px] font-black leading-tight text-right transition-transform ${
                      lane > 0 ? 'bg-leaf text-ink scale-105' : 'bg-leaf/25 text-ink'
                    }`}
                  >
                    {card.rightChoice.text} ➡
                  </div>
                </div>
                {lane === 0 && <div className="text-center text-[11px] font-black text-chili mt-1.5">Pick a door! Middle = Mama decides</div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ready / countdown */}
        {phase !== 'running' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-navy-950/40">
            {phase === 'ready' ? (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center px-6 w-full max-w-md">
                <div className="bg-cream border-4 border-ink rounded-3xl shadow-comic-lg p-4 text-ink">
                  <div className="font-title text-2xl leading-none">{delivering ? 'Get the parcel there' : 'How to japa'}</div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-sm font-extrabold text-left">
                    <span>{hasMouse ? '⬅ ➡ / A D: dodge' : '👈👉 Swipe to dodge'}</span>
                    <span>{hasMouse ? '⬆ / W / Space: jump' : '👆 Swipe up to jump'}</span>
                    <span>{hasMouse ? '⬇ / S: slide' : '👇 Swipe down to slide'}</span>
                    <span>{delivering ? '📦 Reach your customer' : '🚪 Run through a door to choose'}</span>
                  </div>
                  <div className="text-xs font-bold text-ink/60 mt-2">Grab 💵 📄 🍛. Dodge danfos and family WhatsApps.</div>
                </div>
                <button
                  onClick={() => setPhase('countdown')}
                  className="press pointer-events-auto mt-5 w-full min-h-[64px] rounded-2xl bg-leaf border-4 border-ink shadow-comic-lg font-title text-2xl text-ink"
                >
                  {delivering ? 'Start delivery 📦' : 'Run! 🏃🏾‍♂️'}
                </button>
              </motion.div>
            ) : (
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={count}
                  initial={{ scale: 2.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  className="font-title text-[130px] leading-none text-sun [text-shadow:0_8px_0_var(--color-ink)]"
                >
                  {count > 0 ? count : 'GO!'}
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
