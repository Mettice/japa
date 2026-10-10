import React, { useEffect, useRef } from 'react';
import rawAds from '../data/ads.json';
import { AdLocation, AdSlot } from '../types/game';
import { track } from '../utils/analytics';
import { useGameStore } from '../store/gameStore';

const ads = rawAds as unknown as AdSlot[];

const PLACEMENT: Record<AdLocation, AdSlot['placement']> = {
  cyber_cafe: 'cyber_cafe_poster',
  embassy: 'embassy_board',
  agency: 'agency_flyer',
};

export const LOCATION_LABEL: Record<AdLocation, string> = {
  cyber_cafe: '🖥️ Cyber café',
  embassy: '🏛️ Embassy gate',
  agency: '🏢 Agency office',
};

// Stable pick per card so the poster doesn't change between renders
const pickAd = (location: AdLocation, cardId: string): AdSlot | null => {
  const pool = ads.filter((a) => a.active && a.placement === PLACEMENT[location]);
  if (!pool.length) return null;
  let h = 0;
  for (const ch of cardId) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return pool[Math.abs(h) % pool.length];
};

export const AdPoster: React.FC<{ location: AdLocation; cardId: string }> = ({ location, cardId }) => {
  const openAbout = useGameStore((s) => s.openAbout);
  const ad = pickAd(location, cardId);
  const ref = useRef<HTMLDivElement>(null);

  // Framer's drag listens natively on the card, so React's stopPropagation is too late:
  // stop the native pointerdown here so tapping the poster never starts a swipe
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    return () => el.removeEventListener('pointerdown', stop);
  }, []);

  const paper = 'block w-[86px] rotate-[4deg] rounded-md border-[3px] border-ink shadow-comic-sm text-left overflow-hidden';

  return (
    <div ref={ref} className="absolute top-3 right-3 z-10">
      {/* Tape */}
      <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-10 w-8 h-3 bg-sun/80 border border-ink/40 rotate-[-6deg]" />
      {ad ? (
        <a
          href={ad.url}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={() => track({ name: 'ad_clicked', ad: ad.id, placement: ad.placement })}
          className={`${paper} bg-white`}
          aria-label={`Ad: ${ad.text}`}
        >
          {ad.image ? (
            <img src={ad.image} alt="" className="w-full h-[56px] object-cover" draggable={false} />
          ) : (
            <span className="block px-1.5 pt-1.5 text-[9px] leading-[1.15] font-black text-ink line-clamp-4">{ad.text}</span>
          )}
          <span className="block px-1.5 pb-1 pt-0.5 text-[8px] font-black uppercase text-ink/50">Ad · tap</span>
        </a>
      ) : (
        <button
          onClick={() => openAbout('ads')}
          className={`${paper} bg-cream border-dashed px-1.5 py-1.5`}
          aria-label="Advertise here"
        >
          <span className="block font-title text-[12px] leading-none text-ink">YOUR AD HERE</span>
          <span className="block text-[9px] font-black text-ink/60 mt-1 leading-tight">DM to book</span>
        </button>
      )}
    </div>
  );
};
