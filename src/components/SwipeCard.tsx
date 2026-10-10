import React from 'react';
import { MotionValue, motion, useTransform } from 'framer-motion';
import { Card, Character } from '../types/game';
import { AdPoster, LOCATION_LABEL } from './AdPoster';

export const SWIPE_DISTANCE = 90; // px past which a release commits
const SWIPE_VELOCITY = 500; // px/s flick that commits regardless of distance
const PREVIEW_DISTANCE = 25; // px at which the bar dots appear

interface Props {
  card: Card;
  character: Character;
  x: MotionValue<number>;
  onPreview: (dir: 'left' | 'right' | null) => void;
  onCommit: (dir: 'left' | 'right') => void;
}

export const Portrait: React.FC<{ character: Character; size: number }> = ({ character, size }) => (
  <div
    className="rounded-full border-4 border-ink shadow-comic flex items-center justify-center overflow-hidden flex-shrink-0"
    style={{ width: size, height: size, backgroundColor: character.bgColor, fontSize: size * 0.5 }}
  >
    {character.image ? (
      <img src={character.image} alt={character.name} className="w-full h-full object-cover" draggable={false} />
    ) : (
      <span className="leading-none">{character.emoji}</span>
    )}
  </div>
);

export const SwipeCard: React.FC<Props> = ({ card, character, x, onPreview, onCommit }) => {
  const rotate = useTransform(x, [-220, 0, 220], [-16, 0, 16]);
  const opacity = useTransform(x, [-520, -300, 0, 300, 520], [0, 1, 1, 1, 0]);
  // Choice label fades in on the side the card is being dragged towards
  const leftLabel = useTransform(x, [-110, -PREVIEW_DISTANCE], [1, 0]);
  const rightLabel = useTransform(x, [PREVIEW_DISTANCE, 110], [0, 1]);
  const leftLabelScale = useTransform(x, [-110, -PREVIEW_DISTANCE], [1, 0.8]);
  const rightLabelScale = useTransform(x, [PREVIEW_DISTANCE, 110], [0.8, 1]);

  return (
    <motion.div
      key={card.id}
      style={{ x, rotate, opacity }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDrag={(_, info) => {
        const dx = info.offset.x;
        onPreview(dx < -PREVIEW_DISTANCE ? 'left' : dx > PREVIEW_DISTANCE ? 'right' : null);
      }}
      onDragEnd={(_, info) => {
        const { offset, velocity } = info;
        if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) onCommit('left');
        else if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) onCommit('right');
        else onPreview(null);
      }}
      // New card rises from the deck behind it
      initial={{ scale: 0.9, y: 18 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 26 }}
      whileDrag={{ scale: 1.03 }}
      className="absolute inset-0 bg-cream rounded-[28px] border-4 border-ink shadow-comic-lg flex flex-col p-5 cursor-grab active:cursor-grabbing touch-none select-none overflow-hidden"
    >
      {/* Choice labels */}
      <motion.div
        style={{ opacity: leftLabel, scale: leftLabelScale }}
        className="absolute top-3 left-3 z-20 pointer-events-none origin-top-left max-w-[70%]"
      >
        <div className="bg-chili text-cream font-title text-lg leading-tight px-3 py-2 rounded-2xl border-[3px] border-ink shadow-comic -rotate-3">
          {card.leftChoice.text}
        </div>
      </motion.div>
      <motion.div
        style={{ opacity: rightLabel, scale: rightLabelScale }}
        className="absolute top-3 right-3 z-20 pointer-events-none origin-top-right max-w-[70%] text-right"
      >
        <div className="bg-leaf text-ink font-title text-lg leading-tight px-3 py-2 rounded-2xl border-[3px] border-ink shadow-comic rotate-3">
          {card.rightChoice.text}
        </div>
      </motion.div>

      {/* Scene: location tag + in-world ad poster */}
      {card.location && (
        <>
          <span className="absolute top-3 left-3 z-10 text-[10px] font-black uppercase tracking-wide text-ink/60 bg-ink/5 border-2 border-ink/15 rounded-lg px-1.5 py-0.5">
            {LOCATION_LABEL[card.location]}
          </span>
          <AdPoster location={card.location} cardId={card.id} />
        </>
      )}

      {/* Character */}
      <div className="flex flex-col items-center text-center pt-4">
        <Portrait character={character} size={96} />
        <h2 className="font-title text-2xl text-ink leading-tight mt-3">{character.name}</h2>
        <span className="text-[11px] font-black uppercase tracking-wide text-ink/55 leading-tight mt-0.5 px-4">
          {character.role}
        </span>
      </div>

      {/* Situation */}
      <div className="flex-1 flex items-center justify-center py-3">
        <p className="text-ink font-extrabold text-[17px] leading-snug text-center">{card.situation}</p>
      </div>

      <div className="flex justify-between text-[11px] font-black uppercase tracking-wider text-ink/35">
        <span>← swipe</span>
        <span>swipe →</span>
      </div>
    </motion.div>
  );
};
