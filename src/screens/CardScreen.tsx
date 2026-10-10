import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion';
import { Volume2, VolumeX, Home } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { Bars } from '../components/Bars';
import { SwipeCard } from '../components/SwipeCard';

const FLY_DISTANCE = 520;

export const CardScreen: React.FC = () => {
  const {
    getCurrentCard,
    getNextCard,
    getCharacter,
    getCurrentStage,
    setDragDirection,
    applyChoice,
    currentStageIndex,
    stages,
    city,
    mode,
    activeEnding,
    pendingMiniGame,
    soundEnabled,
    toggleSound,
    restartGame,
  } = useGameStore();

  const card = getCurrentCard();
  const character = card ? getCharacter(card.characterId) : undefined;
  const nextCard = getNextCard();
  const stage = getCurrentStage();

  // Shared by drag and tap buttons so both fly the card off the same way
  const x = useMotionValue(0);
  const leaving = useRef(false);

  const commit = useCallback(
    (dir: 'left' | 'right') => {
      if (leaving.current || activeEnding || pendingMiniGame || !card) return;
      leaving.current = true;
      setDragDirection(dir);
      animate(x, dir === 'left' ? -FLY_DISTANCE : FLY_DISTANCE, { type: 'tween', duration: 0.22, ease: 'easeIn' }).then(() => {
        applyChoice(dir);
        x.set(0);
        leaving.current = false;
      });
    },
    [activeEnding, pendingMiniGame, card, applyChoice, setDragDirection, x],
  );

  // Arrow keys for desktop players
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') commit('left');
      if (e.key === 'ArrowRight') commit('right');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commit]);

  // Warm the cache for the next portrait so it never pops in
  useEffect(() => {
    const image = nextCard && getCharacter(nextCard.characterId)?.image;
    if (image) new Image().src = image;
  }, [nextCard, getCharacter]);

  // Stage title card on run start and each stage change
  const [stageToast, setStageToast] = useState<number | null>(currentStageIndex);
  const lastStage = useRef(currentStageIndex);
  useEffect(() => {
    if (currentStageIndex !== lastStage.current) {
      lastStage.current = currentStageIndex;
      setStageToast(currentStageIndex);
    }
  }, [currentStageIndex]);
  useEffect(() => {
    if (stageToast === null) return;
    const t = setTimeout(() => setStageToast(null), 1500);
    return () => clearTimeout(t);
  }, [stageToast]);

  const toastStage = stageToast !== null ? stages[stageToast] : null;

  return (
    <div className="flex-1 w-full flex flex-col min-h-0">
      {/* Bars */}
      <header className="flex-shrink-0 bg-navy-900 border-b-4 border-ink">
        <Bars />
      </header>

      {/* Stage label + controls */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 max-w-md mx-auto w-full">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {city && <span className="text-xl leading-none flag-emoji" aria-label={city.name}>{city.flag}</span>}
          <span className="min-w-0">
            <span className="block font-title text-[17px] text-cream leading-tight truncate">
              Stage {currentStageIndex + 1} · {stage.name}
            </span>
            {/* Stage progress */}
            <span className="flex gap-1 mt-1">
              {stages.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-5 rounded-full ${
                    i < currentStageIndex ? 'bg-leaf' : i === currentStageIndex ? 'bg-sun' : 'bg-navy-700'
                  }`}
                />
              ))}
            </span>
          </span>
          {mode === 'daily' && (
            <span className="flex-shrink-0 text-[10px] font-black uppercase bg-sun text-ink border-2 border-ink rounded-md px-1.5 py-0.5">
              Daily
            </span>
          )}
        </div>
        <button
          onClick={toggleSound}
          aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
          className="press w-12 h-12 flex items-center justify-center bg-navy-700 text-cream rounded-xl border-[3px] border-ink shadow-comic-sm"
        >
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} className="opacity-60" />}
        </button>
        <button
          onClick={restartGame}
          aria-label="Back to start"
          className="press w-12 h-12 flex items-center justify-center bg-navy-700 text-cream rounded-xl border-[3px] border-ink shadow-comic-sm"
        >
          <Home size={20} />
        </button>
      </div>

      {/* Card deck */}
      <section className="flex-1 min-h-0 flex items-center justify-center px-5 py-2 relative">
        <div className="relative w-full max-w-[340px] h-full max-h-[460px]">
          {/* Deck behind (card backs) */}
          {nextCard && (
            <>
              <div className="absolute inset-0 rounded-[28px] border-4 border-ink bg-navy-700 card-back-pattern translate-y-5 scale-[0.88] rotate-2" />
              <div className="absolute inset-0 rounded-[28px] border-4 border-ink bg-navy-600 card-back-pattern translate-y-2.5 scale-[0.94] -rotate-1 flex items-center justify-center">
                <span className="text-5xl opacity-40">✈️</span>
              </div>
            </>
          )}
          {card && character && (
            <SwipeCard key={card.id} card={card} character={character} x={x} onPreview={setDragDirection} onCommit={commit} />
          )}
        </div>

        {/* Stage title card */}
        <AnimatePresence>
          {toastStage && (
            <motion.div
              key={stageToast}
              initial={{ opacity: 0, scale: 0.7, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              className="absolute inset-x-6 top-1/3 z-30 pointer-events-none"
            >
              <div className="bg-sun border-4 border-ink rounded-3xl shadow-comic-lg px-4 py-3 text-center -rotate-2">
                <div className="text-4xl leading-none mb-1">{toastStage.icon}</div>
                <div className="font-title text-ink/60 text-sm uppercase tracking-widest">Stage {(stageToast ?? 0) + 1}</div>
                <div className="font-title text-ink text-3xl leading-none">{toastStage.name}</div>
                <div className="text-ink/80 font-extrabold text-xs mt-1">{toastStage.tagline}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Tap buttons for people who don't swipe */}
      {card && (
        <footer className="flex-shrink-0 grid grid-cols-2 gap-3 px-4 pt-2 pb-4 max-w-md mx-auto w-full">
          {(['left', 'right'] as const).map((dir) => {
            const choice = dir === 'left' ? card.leftChoice : card.rightChoice;
            return (
              <button
                key={dir}
                onClick={() => commit(dir)}
                onPointerEnter={() => setDragDirection(dir)}
                onPointerLeave={() => !leaving.current && setDragDirection(null)}
                onFocus={() => setDragDirection(dir)}
                onBlur={() => !leaving.current && setDragDirection(null)}
                className={`press min-h-[64px] rounded-2xl border-[3px] border-ink shadow-comic px-3 py-2 flex items-center justify-center text-center font-extrabold text-[14px] leading-tight ${
                  dir === 'left' ? 'bg-chili text-cream' : 'bg-leaf text-ink'
                }`}
              >
                <span className="line-clamp-3">
                  {dir === 'left' && '← '}
                  {choice.text}
                  {dir === 'right' && ' →'}
                </span>
              </button>
            );
          })}
        </footer>
      )}
    </div>
  );
};
