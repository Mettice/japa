import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, Info } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { useLiveCount } from '../utils/liveCount';


export const StartScreen: React.FC = () => {
  const { cities, lastCityId, startRun, startDailyRun, dailyCity, event, soundEnabled, toggleSound, openAbout } = useGameStore();
  const [cityId, setCityId] = useState(lastCityId ?? cities[0].id);
  const liveCount = useLiveCount();

  return (
    <div className="flex-1 w-full flex flex-col px-5 pt-4 pb-5 overflow-y-auto no-scrollbar">
      {/* Top bar: about + mute */}
      <div className="flex justify-between mb-3">
        <button
          onClick={() => openAbout()}
          className="press min-h-[48px] px-3 rounded-xl bg-navy-800 border-[3px] border-ink shadow-comic-sm text-cream/80 font-extrabold text-sm flex items-center gap-1.5"
        >
          <Info size={18} /> About
        </button>
        <button
          onClick={toggleSound}
          aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'}
          className="press w-12 h-12 rounded-xl bg-navy-800 border-[3px] border-ink shadow-comic-sm text-cream flex items-center justify-center"
        >
          {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} className="opacity-60" />}
        </button>
      </div>

      {/* Weekly event banner */}
      {event && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25, delay: 0.3 }}
          className="mb-4 bg-sun text-ink rounded-2xl border-[3px] border-ink shadow-comic px-3 py-2.5 flex items-center gap-2.5"
        >
          <span className="text-2xl leading-none">{event.emoji}</span>
          <span className="min-w-0">
            <span className="block font-title text-base leading-tight">{event.title}</span>
            <span className="block text-xs font-bold leading-snug">{event.banner}</span>
          </span>
        </motion.div>
      )}

      {/* Title */}
      <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
        <motion.div
          initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: -6, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 14 }}
          className="w-20 h-20 bg-sun rounded-3xl border-4 border-ink shadow-comic-lg flex items-center justify-center text-5xl mb-4"
        >
          ✈️
        </motion.div>
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="font-title text-5xl text-sun leading-none tracking-wide [text-shadow:0_4px_0_var(--color-ink)]"
        >
          BUSH FALLER
        </motion.h1>
        <p className="font-extrabold text-cream/70 text-sm uppercase tracking-[0.2em] mt-2">The Japa Game</p>

        {/* Live counter: only shown with a real number (Phase 6) */}
        {liveCount !== null && (
        <div className="mt-4 inline-flex items-center gap-2 bg-navy-800 border-2 border-navy-600 rounded-full px-3 py-1.5">
          <span className="relative flex w-2.5 h-2.5">
            <span className="absolute inset-0 rounded-full bg-leaf animate-ping opacity-75" />
            <span className="relative w-2.5 h-2.5 rounded-full bg-leaf" />
          </span>
          <span className="text-xs font-extrabold text-cream/90">
            {liveCount.toLocaleString('en-US')} people trying to japa right now
          </span>
        </div>
        )}
      </div>

      {/* City picker */}
      <p className="font-title text-cream text-lg text-center mb-2">Where you dey japa from?</p>
      <div className="grid grid-cols-3 gap-2 mb-5" role="radiogroup" aria-label="Starting city">
        {cities.map((city) => {
          const selected = city.id === cityId;
          return (
            <motion.button
              key={city.id}
              role="radio"
              aria-checked={selected}
              onClick={() => setCityId(city.id)}
              whileTap={{ scale: 0.92 }}
              animate={{ y: selected ? -3 : 0 }}
              className={`min-h-[64px] rounded-2xl border-[3px] border-ink flex flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
                selected ? 'bg-sun text-ink shadow-comic' : 'bg-navy-800 text-cream/80 shadow-comic-sm'
              }`}
            >
              <span className="text-2xl leading-none flag-emoji">{city.flag}</span>
              <span className="font-title text-base leading-none">{city.name}</span>
              <span className={`text-[10px] font-extrabold ${selected ? 'text-ink/70' : 'text-cream/50'}`}>
                {city.currency.symbol}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Primary + secondary actions */}
      <motion.button
        onClick={() => startRun(cityId)}
        whileTap={{ scale: 0.97 }}
        className="press w-full min-h-[64px] rounded-2xl bg-leaf border-4 border-ink shadow-comic-lg font-title text-2xl text-ink tracking-wide"
      >
        Start your japa ✈️
      </motion.button>

      <button
        onClick={startDailyRun}
        className="press mt-3 w-full min-h-[52px] rounded-2xl bg-navy-700 border-[3px] border-ink shadow-comic flex items-center justify-center gap-2 px-3"
      >
        <span className="text-xl leading-none">🏛️</span>
        <span className="text-left">
          <span className="block font-title text-lg text-cream leading-none">Daily embassy</span>
          <span className="block text-[11px] font-bold text-cream/60 leading-tight mt-0.5">
            Same run for everyone today · <span className="flag-emoji">{dailyCity.flag}</span> {dailyCity.name}
          </span>
        </span>
      </button>
    </div>
  );
};
