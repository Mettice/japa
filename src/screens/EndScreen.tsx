import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Share2, RotateCcw, Home, X, Download } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { STAT_KEYS } from '../engine/engine';
import { ShareCard, ShareFormat, SHARE_SIZES, stripEmoji } from '../share/ShareCard';
import { dataUrlToFile, renderNodeToPng } from '../share/exportPng';
import { BAR_META, isLocalUrl, shareText, shareUrl, summarizeRun } from '../share/shareInfo';
import { track } from '../utils/analytics';

interface Rendered {
  dataUrl: string;
  file: File;
}

const FORMAT_LABELS: Record<ShareFormat, string> = { story: '9:16 Status', square: '1:1 Square' };
const BAR_FILL: Record<string, string> = { money: 'bg-sun', papers: 'bg-sky', morale: 'bg-leaf', familyPressure: 'bg-chili' };

export const EndScreen: React.FC = () => {
  const { activeEnding, stats, currentStageIndex, stages, cardsSwiped, city, dailyNo, startRun, startDailyRun, restartGame, mode, life } =
    useGameStore();

  const [format, setFormat] = useState<ShareFormat>('story');
  const [rendered, setRendered] = useState<Partial<Record<ShareFormat, Rendered>>>({});
  const [failed, setFailed] = useState(false);
  const [fullPreview, setFullPreview] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const cardRefs = { story: useRef<HTMLDivElement>(null), square: useRef<HTMLDivElement>(null) };

  const url = shareUrl();
  const run = useMemo(
    () => (activeEnding ? summarizeRun(activeEnding, city, stages, currentStageIndex, cardsSwiped, dailyNo) : null),
    [activeEnding, city, stages, currentStageIndex, cardsSwiped, dailyNo],
  );

  // Fresh renders for every new ending
  useEffect(() => {
    setRendered({});
    setFailed(false);
    setFormat('story');
    if (activeEnding?.type === 'victory') {
      try {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.35 }, colors: ['#FFC93C', '#2FCB7A', '#FF5A4E', '#FFF6E3'] });
      } catch {}
    }
  }, [activeEnding]);

  // Render the PNG up front: navigator.share must run straight from the tap,
  // and Android drops the user gesture if we spend seconds rendering first
  useEffect(() => {
    if (!run || rendered[format]) return;
    let cancelled = false;
    const node = cardRefs[format].current;
    if (!node) return;
    setFailed(false);
    renderNodeToPng(node, { ...SHARE_SIZES[format], emojiText: run.city?.flag ?? '' })
      .then(async (dataUrl) => {
        const file = await dataUrlToFile(dataUrl, `bush-faller-${run.ending.id}-${format}.png`);
        if (!cancelled) setRendered((r) => ({ ...r, [format]: { dataUrl, file } }));
      })
      .catch((err) => {
        console.error('Share card render failed', err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [run, format, rendered]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2800);
  };

  const current = rendered[format];

  const handleShare = useCallback(async () => {
    if (!run) return;
    const text = shareText(run, url);

    if (current && navigator.canShare?.({ files: [current.file] })) {
      try {
        await navigator.share({ files: [current.file], text, title: 'Bush Faller' });
        track({ name: 'share_clicked', format, method: 'web_share' });
        return;
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          track({ name: 'share_clicked', format, method: 'cancelled' });
          return; // user closed the sheet
        }
      }
    }
    track({ name: 'share_clicked', format, method: 'download' });

    // Fallback: save the PNG and copy the link + caption
    if (current) {
      const link = document.createElement('a');
      link.download = current.file.name;
      link.href = current.dataUrl;
      link.click();
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {}
    showToast(
      current && copied ? 'Image saved + caption copied 📋' : current ? 'Image saved 📥' : copied ? 'Caption copied 📋' : 'Sharing not supported here',
    );
  }, [run, url, current, format]);

  if (!activeEnding || !run) return null;

  const isVictory = activeEnding.type === 'victory';
  const size = SHARE_SIZES[format];

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/95 backdrop-blur-sm overflow-y-auto no-scrollbar app-screen">
      {/* Phone: one column. Desktop (lg): result on the left, share card + actions on the right */}
      <div className="max-w-[420px] mx-auto px-5 pt-5 pb-6 flex flex-col lg:max-w-5xl lg:min-h-full lg:grid lg:grid-cols-2 lg:gap-14 lg:items-center lg:px-10">
        <div className="flex flex-col items-center text-center">
        {/* Label */}
        <motion.div
          initial={{ y: -16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className={`px-3 py-1 rounded-full border-[3px] border-ink font-title text-sm tracking-wide shadow-comic-sm ${
            isVictory ? 'bg-leaf text-ink' : 'bg-sun text-ink'
          }`}
        >
          {dailyNo ? `Daily Embassy #${dailyNo}` : isVictory ? 'You made it!' : activeEnding.badge}
        </motion.div>

        {/* Hero */}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.1 }}
          className="mt-4 w-32 h-32 rounded-full bg-cream border-[5px] border-ink shadow-comic-lg flex items-center justify-center text-[76px] leading-none lg:w-44 lg:h-44 lg:text-[104px]"
        >
          {activeEnding.emoji}
        </motion.div>
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="font-title text-[38px] leading-none text-sun mt-5 [text-shadow:0_3px_0_var(--color-ink)] lg:text-[56px]"
        >
          {stripEmoji(activeEnding.title)}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="font-extrabold text-cream text-base leading-snug mt-2 px-2"
        >
          {activeEnding.subtitle}
        </motion.p>

        {/* Run stats */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="w-full mt-5 bg-navy-800 border-[3px] border-ink rounded-2xl shadow-comic p-3"
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="font-title text-2xl text-cream leading-none">
                {run.stageReached}
                <span className="text-cream/50 text-base">/{run.stageCount}</span>
              </div>
              <div className="text-[10px] font-black uppercase text-cream/60 mt-1 leading-tight">{run.stageName}</div>
            </div>
            <div>
              <div className="font-title text-2xl text-cream leading-none">{run.cardsSurvived}</div>
              <div className="text-[10px] font-black uppercase text-cream/60 mt-1 leading-tight">Cards survived</div>
            </div>
            <div>
              <div className="text-2xl leading-none flag-emoji">{city?.flag}</div>
              <div className="text-[10px] font-black uppercase text-cream/60 mt-1 leading-tight">{city?.name}</div>
            </div>
          </div>
          {/* Final bars */}
          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t-2 border-navy-600">
            {STAT_KEYS.map((key) => {
              const v = stats[key];
              const dead = v <= 0 || v >= 100;
              return (
                <div key={key} className="flex flex-col items-center gap-1">
                  <span className="text-lg leading-none">{BAR_META[key].icon}</span>
                  <div className={`w-full h-2.5 rounded-full bg-navy-950 border ${dead ? 'border-chili' : 'border-navy-600'} overflow-hidden`}>
                    <div className={`h-full ${BAR_FILL[key]}`} style={{ width: `${v}%` }} />
                  </div>
                  <span className={`text-[10px] font-black ${dead ? 'text-chili' : 'text-cream/60'}`}>{v}%</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {mode === 'journey' && life && <div className="w-full mt-4 text-left bg-cream text-ink rounded-2xl border-[3px] border-ink p-4"><p className="text-xs font-black uppercase mb-2">A message from home</p><p className="text-sm font-bold">{life.lastMessage}</p><p className="text-xs mt-2 text-ink/60">{life.chapter}/4 milestones · Your savings and relationships carry forward. Rest at home restores wellbeing and eases family pressure.</p></div>}
        {mode === 'journey' && <button onClick={restartGame} className="press w-full mt-4 min-h-[64px] rounded-2xl bg-leaf border-4 border-ink shadow-comic-lg font-title text-2xl text-ink">Return home 🏡</button>}
        </div>
        <div className="flex flex-col items-center text-center">
        {/* Share preview */}
        <div className="w-full mt-5 flex items-center justify-center gap-2" role="radiogroup" aria-label="Share card format">
          {(Object.keys(FORMAT_LABELS) as ShareFormat[]).map((f) => (
            <button
              key={f}
              role="radio"
              aria-checked={format === f}
              onClick={() => setFormat(f)}
              className={`min-h-[40px] px-3 rounded-xl border-[3px] border-ink font-extrabold text-xs ${
                format === f ? 'bg-cream text-ink shadow-comic-sm' : 'bg-navy-800 text-cream/70'
              }`}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
        <button
          onClick={() => current && setFullPreview(true)}
          aria-label="Preview share card"
          className="mt-3 relative rounded-2xl border-[3px] border-ink shadow-comic overflow-hidden bg-navy-800 h-[230px] lg:h-[380px]"
          style={{ aspectRatio: `${size.width} / ${size.height}` }}
        >
          {current ? (
            <img src={current.dataUrl} alt="Your share card" className="w-full h-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-cream/70 text-xs font-extrabold px-2">
              {failed ? (
                <>⚠️ Couldn't paint the card</>
              ) : (
                <>
                  <span className="w-6 h-6 rounded-full border-[3px] border-sun border-t-transparent animate-spin" />
                  Painting your card…
                </>
              )}
            </span>
          )}
        </button>

        {isLocalUrl(url) && (
          <p className="mt-2 text-[11px] font-extrabold text-chili leading-snug">
            ⚠️ Card shows a local address. Set "shareUrl" in config.json or VITE_SHARE_URL before deploying.
          </p>
        )}

        {/* Actions */}
        <motion.button
          onClick={handleShare}
          disabled={!current && !failed}
          whileTap={{ scale: 0.97 }}
          animate={current ? { scale: [1, 1.04, 1] } : {}}
          transition={{ duration: 0.5 }}
          className="press w-full mt-5 min-h-[72px] rounded-2xl bg-sun border-4 border-ink shadow-comic-lg font-title text-3xl text-ink flex items-center justify-center gap-3 disabled:opacity-70"
        >
          <Share2 size={28} strokeWidth={3} />
          Share
        </motion.button>
        {mode !== 'journey' && <div className="w-full grid grid-cols-2 gap-3 mt-3">
          <button
            onClick={() => city && startRun(city.id)}
            className="press min-h-[56px] rounded-2xl bg-leaf border-[3px] border-ink shadow-comic font-title text-lg text-ink flex items-center justify-center gap-2"
          >
            <RotateCcw size={20} strokeWidth={3} />
            Try again
          </button>
          <button
            onClick={startDailyRun}
            className="press min-h-[56px] rounded-2xl bg-navy-700 border-[3px] border-ink shadow-comic font-title text-lg text-cream flex items-center justify-center gap-2"
          >
            🏛️ Daily embassy
          </button>
        </div>}
        <button onClick={restartGame} className="mt-3 min-h-[48px] px-4 text-cream/60 font-extrabold text-sm flex items-center gap-1.5">
          <Home size={16} /> {mode === 'journey' ? 'My room & phone' : 'Return home'}
        </button>
        </div>
      </div>

      {/* Full-size preview */}
      <AnimatePresence>
        {fullPreview && current && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-ink/95 flex flex-col items-center justify-center p-4 gap-4"
            onClick={() => setFullPreview(false)}
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              src={current.dataUrl}
              alt="Your share card"
              className="max-h-[78vh] max-w-full rounded-2xl border-4 border-ink"
            />
            <div className="flex gap-3" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={handleShare}
                className="press min-h-[56px] px-6 rounded-2xl bg-sun border-[3px] border-ink shadow-comic font-title text-xl text-ink flex items-center gap-2"
              >
                <Share2 size={22} strokeWidth={3} /> Share
              </button>
              <a
                href={current.dataUrl}
                download={current.file.name}
                className="press min-h-[56px] w-14 rounded-2xl bg-navy-700 border-[3px] border-ink shadow-comic text-cream flex items-center justify-center"
                aria-label="Download image"
              >
                <Download size={22} />
              </a>
              <button
                onClick={() => setFullPreview(false)}
                className="press min-h-[56px] w-14 rounded-2xl bg-navy-700 border-[3px] border-ink shadow-comic text-cream flex items-center justify-center"
                aria-label="Close preview"
              >
                <X size={22} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-cream text-ink font-extrabold text-sm px-4 py-3 rounded-2xl border-[3px] border-ink shadow-comic whitespace-nowrap"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offscreen share cards; the wrapper is offscreen, the captured nodes are not positioned */}
      <div aria-hidden style={{ position: 'fixed', left: -20000, top: 0, pointerEvents: 'none' }}>
        <ShareCard ref={cardRefs.story} run={run} format="story" url={url} />
        <ShareCard ref={cardRefs.square} run={run} format="square" url={url} />
      </div>
    </div>
  );
};
