import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { GameStats, StatKey } from '../types/game';
import { sound } from '../utils/audio';

interface BarMeta {
  key: StatKey;
  label: string;
  icon: string;
  fill: string;
}

const BARS: BarMeta[] = [
  { key: 'money', label: 'Money', icon: '💰', fill: 'bg-sun' },
  { key: 'papers', label: 'Papers', icon: '📄', fill: 'bg-sky' },
  { key: 'morale', label: 'Morale', icon: '🙂', fill: 'bg-leaf' },
  { key: 'familyPressure', label: 'Family', icon: '👨‍👩‍👧', fill: 'bg-chili' },
];

const isDanger = (v: number) => v <= 20 || v >= 80;

const Bar: React.FC<{ meta: BarMeta; value: number; previewed: boolean }> = ({ meta, value, previewed }) => {
  const controls = useAnimationControls();
  const prev = useRef(value);
  // Direction is revealed only after the choice lands (the preview dot stays neutral)
  const [delta, setDelta] = useState<{ dir: 'up' | 'down'; id: number } | null>(null);

  useEffect(() => {
    if (value === prev.current) return;
    const dir = value > prev.current ? 'up' : 'down';
    prev.current = value;
    setDelta({ dir, id: Date.now() });
    controls.start({ scale: [1, 1.18, 0.96, 1], transition: { duration: 0.45, ease: 'easeOut' } });
  }, [value, controls]);

  const danger = isDanger(value);

  return (
    <div className="flex flex-col items-center gap-1 relative">
      {/* Reigns-style preview dot: which bars move, never how */}
      <div className="h-3 flex items-center justify-center">
        <AnimatePresence>
          {previewed && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              className="block w-3 h-3 rounded-full bg-cream border-2 border-ink"
            />
          )}
        </AnimatePresence>
      </div>

      <motion.div
        animate={controls}
        className={`relative w-[64px] h-[60px] rounded-2xl border-[3px] overflow-hidden bg-navy-800 ${
          danger ? 'border-chili animate-pulse' : 'border-ink'
        }`}
        role="meter"
        aria-label={meta.label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Liquid fill from the bottom */}
        <motion.div
          className={`absolute bottom-0 left-0 right-0 ${meta.fill}`}
          initial={false}
          animate={{ height: `${value}%` }}
          transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        />
        {/* Change flash */}
        <AnimatePresence>
          {delta && (
            <motion.div
              key={delta.id}
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className={`absolute inset-0 ${delta.dir === 'up' ? 'bg-white' : 'bg-ink'}`}
            />
          )}
        </AnimatePresence>
        <span className="absolute inset-0 flex items-center justify-center text-[28px] leading-none drop-shadow-[0_2px_0_rgba(5,9,20,0.6)]">
          {meta.icon}
        </span>
      </motion.div>

      {/* Floating arrow after a change */}
      <AnimatePresence>
        {delta && (
          <motion.span
            key={delta.id}
            initial={{ opacity: 1, y: 10 }}
            animate={{ opacity: 0, y: delta.dir === 'up' ? -18 : 18 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            onAnimationComplete={() => setDelta((d) => (d?.id === delta.id ? null : d))}
            className={`absolute top-6 font-title text-2xl pointer-events-none [text-shadow:0_2px_0_var(--color-ink)] ${
              delta.dir === 'up' ? 'text-leaf' : 'text-chili'
            }`}
          >
            {delta.dir === 'up' ? '▲' : '▼'}
          </motion.span>
        )}
      </AnimatePresence>

      <span className={`text-[11px] font-black uppercase tracking-wide ${danger ? 'text-chili' : 'text-cream/80'}`}>
        {meta.label}
      </span>
    </div>
  );
};

export const Bars: React.FC = () => {
  const { stats, dragDirection, getCurrentCard } = useGameStore();
  const card = getCurrentCard();
  const effects = dragDirection && card ? (dragDirection === 'left' ? card.leftChoice : card.rightChoice).effects : {};

  // One light haptic + blip per choice, whichever bars moved
  const prevStats = useRef<GameStats>(stats);
  useEffect(() => {
    const prev = prevStats.current;
    prevStats.current = stats;
    if (!BARS.some(({ key }) => stats[key] !== prev[key])) return;
    sound.triggerHaptic('light');
    // "Good" = bars net moved away from the deadly edges (towards 50)
    const centering = BARS.reduce((sum, { key }) => sum + Math.abs(prev[key] - 50) - Math.abs(stats[key] - 50), 0);
    const t = setTimeout(() => sound.playBarChange(centering >= 0), 90); // after the swipe whoosh
    return () => clearTimeout(t);
  }, [stats]);

  return (
    <div className="grid grid-cols-4 gap-1 px-3 pt-2 pb-1 max-w-md mx-auto w-full justify-items-center">
      {BARS.map((meta) => (
        <Bar key={meta.key} meta={meta} value={stats[meta.key]} previewed={!!effects[meta.key]} />
      ))}
    </div>
  );
};
