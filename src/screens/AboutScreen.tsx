import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import rawConfig from '../data/config.json';
import { useGameStore } from '../store/gameStore';
import { TRACKS } from '../utils/music';
import { GameConfig } from '../types/game';

const { adsContact } = rawConfig as unknown as GameConfig;

const Section: React.FC<{ title: string; id?: string; children: React.ReactNode }> = ({ title, id, children }) => (
  <section id={id} className="bg-navy-800 border-[3px] border-ink rounded-2xl shadow-comic p-4 mt-4">
    <h2 className="font-title text-xl text-sun leading-none mb-2">{title}</h2>
    <div className="text-sm font-bold text-cream/85 leading-relaxed space-y-2">{children}</div>
  </section>
);

export default function AboutScreen() {
  const { aboutOpen, closeAbout } = useGameStore();
  
  const scroller = useRef<HTMLDivElement>(null);

  // Set scrollTop directly: scrollIntoView is unreliable while the panel is still sliding in
  useEffect(() => {
    const el = scroller.current;
    const ads = document.getElementById('ads');
    if (aboutOpen === 'ads' && el && ads) el.scrollTop = ads.offsetTop - 80; // clear the sticky header
  }, [aboutOpen]);

  // Esc / Android back-gesture friendly close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAbout();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeAbout]);

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      ref={scroller}
      className="absolute inset-0 z-[80] bg-navy-900 overflow-y-auto no-scrollbar"
      role="dialog"
      aria-label="About Bush Faller"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-navy-900 border-b-4 border-ink">
        <h1 className="font-title text-2xl text-cream">About</h1>
        <button
          onClick={closeAbout}
          aria-label="Close"
          className="press w-12 h-12 rounded-xl bg-navy-700 border-[3px] border-ink shadow-comic-sm text-cream flex items-center justify-center"
        >
          <X size={22} />
        </button>
      </div>

      <div className="px-4 pb-10 mx-auto w-full max-w-2xl">
        {/* The disclaimer comes first and loudest */}
        <div className="mt-4 bg-sun text-ink border-4 border-ink rounded-2xl shadow-comic-lg p-4 text-center -rotate-1">
          <div className="text-4xl leading-none">⚠️</div>
          <p className="font-title text-2xl leading-tight mt-2">Satire. Not immigration advice.</p>
          <p className="font-title text-2xl leading-tight text-chili-dark">Don't pay any agent.</p>
          <p className="text-xs font-extrabold mt-2 text-ink/75">
            Every character, agent and "guaranteed visa" in this game is made up. Real visas only come from official embassy
            and government channels.
          </p>
        </div>

        <Section title="What is this?">
          <p>
            Bush Faller is a swipe game about the japa journey from Lagos, Douala and Accra: the hustle, the agents, the
            embassy queue, and the first winter. Laugh, then share it with someone who's about to sow seed for a visa.
          </p>
        </Section>

        <Section title="Advertise in the game" id="ads">
          <p>
            Posters in the game's cyber cafés, embassy notice boards and agency offices are real ad slots. Players see them
            mid-run, and every tap opens your link.
          </p>
          <a
            href={adsContact.url}
            className="press mt-2 inline-flex min-h-[48px] items-center gap-2 px-4 rounded-xl bg-leaf text-ink border-[3px] border-ink shadow-comic-sm font-title text-lg"
          >
            📩 DM to book · {adsContact.label}
          </a>
          <p className="text-xs text-cream/60">
            We don't run ads for visa agents, "guaranteed" visas, or anything that looks like a scam.
          </p>
        </Section>

        <Section title="Privacy">
          <p>No accounts and no cookies. We count anonymous events (run started, ending reached, share and ad taps) to see what people enjoy. Nothing identifies you.</p>
        </Section>

        <Section title="Credits">
          <p>Game, writing & design: PLACEHOLDER (your name here)</p>
          <p>Fonts: Lilita One, Nunito and Noto Color Emoji via Google Fonts (SIL Open Font License)</p>
          <p>Icons: Lucide (ISC). Built with React, Vite, Framer Motion and Zustand.</p>
          {TRACKS.length > 0 && (
            <p>
              Music:{' '}
              {TRACKS.map((t) => `${t.title} by ${t.credit}`).join(' · ')}
            </p>
          )}
        </Section>
      </div>
    </motion.div>
  );
}
