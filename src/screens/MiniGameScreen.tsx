import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { miniGameEffects, miniGameSeed, mulberry32, scaleEffects, STAT_KEYS } from '../engine/engine';
import { MiniGameId } from '../types/game';
import { MiniGameOutcome, MiniGameProps } from '../minigames/types';
import { BAR_META } from '../share/shareInfo';
import { sound } from '../utils/audio';

// Each game is its own chunk, fetched only when a run reaches its stage
const GAMES: Record<MiniGameId, React.LazyExoticComponent<React.ComponentType<MiniGameProps>>> = {
  queue: lazy(() => import('../minigames/EmbassyQueue')),
  interview: lazy(() => import('../minigames/VisaInterview')),
  winter: lazy(() => import('../minigames/FirstWinter')),
};

const INTROS: Record<MiniGameId, { title: string; emoji: string; how: string }> = {
  queue: { title: 'Embassy Queue', emoji: '🚶🏾‍♂️', how: 'People go try cut in front of you. Tap them away before they pass you!' },
  interview: { title: 'Visa Interview', emoji: '🧐', how: 'The officer fires questions. Tap the right answer before the timer runs out.' },
  winter: { title: 'First Winter', emoji: '❄️', how: 'Tap heaters, hot chocolate and jackets to stay warm. Don’t touch the bills!' },
};

// Warm the chunk during the intro so "Ready" starts instantly
const preload = (id: MiniGameId) => {
  if (id === 'queue') import('../minigames/EmbassyQueue');
  if (id === 'interview') import('../minigames/VisaInterview');
  if (id === 'winter') import('../minigames/FirstWinter');
};

type Phase = 'intro' | 'countdown' | 'play' | 'result';

export const MiniGameScreen: React.FC = () => {
  const { pendingMiniGame, currentStageIndex, stages, seed, event, finishMiniGame } = useGameStore();
  const [phase, setPhase] = useState<Phase>('intro');
  const [count, setCount] = useState(3);
  const [outcome, setOutcome] = useState<MiniGameOutcome | null>(null);

  const id = pendingMiniGame;
  const rng = useMemo(() => mulberry32(miniGameSeed(seed, currentStageIndex)), [seed, currentStageIndex]);

  // Reset for each new mini-game
  useEffect(() => {
    if (!id) return;
    setPhase('intro');
    setOutcome(null);
    preload(id);
  }, [id, currentStageIndex]);

  // 3-2-1-GO
  useEffect(() => {
    if (phase !== 'countdown') return;
    setCount(3);
    sound.playTick();
    let n = 3;
    const t = setInterval(() => {
      n--;
      setCount(n);
      if (n > 0) sound.playTick();
      if (n === 0) sound.playClick();
      if (n < 0) {
        clearInterval(t);
        setPhase('play');
      }
    }, 700);
    return () => clearInterval(t);
  }, [phase]);

  if (!id) return null;

  const Game = GAMES[id];
  const intro = INTROS[id];
  const stage = stages[currentStageIndex];
  // Show exactly what will be applied, including this week's event multipliers
  const effects = outcome ? scaleEffects(miniGameEffects(id, outcome.result), event?.modifiers) : {};

  return (
    <div className="absolute inset-0 z-40 bg-navy-900 flex flex-col">
      {phase === 'intro' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 flex flex-col items-center justify-center text-center px-6"
        >
          <div className="font-title text-sun/80 text-sm uppercase tracking-widest">
            Stage {currentStageIndex + 1} · {stage?.name}
          </div>
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 12 }}
            className="mt-4 w-28 h-28 rounded-3xl bg-sun border-4 border-ink shadow-comic-lg flex items-center justify-center text-6xl"
          >
            {intro.emoji}
          </motion.div>
          <h2 className="font-title text-4xl text-cream mt-5 leading-none">{intro.title}</h2>
          <p className="font-extrabold text-cream/80 text-base mt-3 leading-snug max-w-[300px]">{intro.how}</p>
          <div className="text-cream/50 text-xs font-extrabold mt-2">Mini-game · about 15 seconds</div>
          <button
            onClick={() => setPhase('countdown')}
            className="press mt-8 w-full max-w-[300px] min-h-[64px] rounded-2xl bg-leaf border-4 border-ink shadow-comic-lg font-title text-2xl text-ink"
          >
            I'm ready!
          </button>
        </motion.div>
      )}

      {phase === 'countdown' && (
        <div className="flex-1 flex items-center justify-center">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={count}
              initial={{ scale: 2.2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="font-title text-[140px] leading-none text-sun [text-shadow:0_8px_0_var(--color-ink)]"
            >
              {count > 0 ? count : 'GO!'}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {phase === 'play' && (
        <div className="flex-1 min-h-0">
          <Suspense
            fallback={<div className="h-full flex items-center justify-center text-cream/70 font-extrabold">Loading…</div>}
          >
            <Game
              rng={rng}
              onFinish={(o) => {
                setOutcome(o);
                setPhase('result');
              }}
            />
          </Suspense>
        </div>
      )}

      {phase === 'result' && outcome && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 flex flex-col items-center justify-center text-center px-6"
        >
          <motion.div
            initial={{ scale: 0, rotate: -25 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 11 }}
            className="w-32 h-32 rounded-full bg-cream border-[5px] border-ink shadow-comic-lg flex items-center justify-center text-7xl"
          >
            {outcome.emoji}
          </motion.div>
          <h2 className="font-title text-[34px] text-sun mt-5 leading-none [text-shadow:0_3px_0_var(--color-ink)]">
            {outcome.headline}
          </h2>
          <p className="font-extrabold text-cream/80 text-sm mt-2">{outcome.detail}</p>

          {/* What it does to your bars */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {STAT_KEYS.filter((k) => effects[k]).map((k, i) => {
              const v = effects[k]!;
              const good = k === 'familyPressure' ? v < 0 : v > 0;
              return (
                <motion.span
                  key={k}
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 + i * 0.12 }}
                  className={`px-3 py-2 rounded-xl border-[3px] border-ink shadow-comic-sm font-title text-lg ${
                    good ? 'bg-leaf text-ink' : 'bg-chili text-cream'
                  }`}
                >
                  {BAR_META[k].icon} {BAR_META[k].label} {v > 0 ? `+${v}` : `−${Math.abs(v)}`}
                </motion.span>
              );
            })}
          </div>

          <button
            onClick={() => finishMiniGame(outcome.result)}
            className="press mt-8 w-full max-w-[300px] min-h-[64px] rounded-2xl bg-sun border-4 border-ink shadow-comic-lg font-title text-2xl text-ink"
          >
            Continue →
          </button>
        </motion.div>
      )}
    </div>
  );
};
