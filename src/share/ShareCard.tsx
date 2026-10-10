import { forwardRef } from 'react';
import { RunSummary, causeChip, displayUrl } from './shareInfo';

export type ShareFormat = 'story' | 'square';

export const SHARE_SIZES: Record<ShareFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 }, // WhatsApp status / TikTok
  square: { width: 1080, height: 1080 },
};

// Plain hex (not CSS vars) so the exported PNG doesn't depend on page styles
const C = {
  ink: '#050914',
  navy: '#0B1430',
  cream: '#FFF6E3',
  sun: '#FFC93C',
  leaf: '#2FCB7A',
};
const TITLE_FONT = '"Lilita One", "Nunito", sans-serif';
const BODY_FONT = '"Nunito", sans-serif';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const FLAG_FONT = '"Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

// Titles carry their own emoji; the card already shows it huge
export const stripEmoji = (s: string) => s.replace(/[\p{Extended_Pictographic}‍️]/gu, '').replace(/\s+/g, ' ').trim();

interface Props {
  run: RunSummary;
  format: ShareFormat;
  url: string;
}

export const ShareCard = forwardRef<HTMLDivElement, Props>(({ run, format, url }, ref) => {
  const { ending, city, dailyNo } = run;
  const story = format === 'story';
  const { width, height } = SHARE_SIZES[format];
  const s = story ? 1 : 0.72; // type scale for the square layout
  const bg = ending.type === 'victory' ? C.leaf : C.sun;
  const pad = story ? 72 : 52;

  const chips = [`🏁 Stage ${run.stageReached}/${run.stageCount}`, `🃏 ${run.cardsSurvived} cards survived`, causeChip(ending)];

  return (
    <div
      ref={ref}
      style={{
        width,
        height,
        background: bg,
        color: C.ink,
        fontFamily: BODY_FONT,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Sunburst behind the emoji */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: story ? 700 : 420,
          width: 1800,
          height: 1800,
          marginLeft: -900,
          marginTop: -900,
          background: `repeating-conic-gradient(rgba(255,255,255,0.22) 0deg 10deg, transparent 10deg 20deg)`,
          borderRadius: '50%',
        }}
      />

      {/* Header: logo + city */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${pad}px ${pad}px 0` }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 * s }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18 * s,
              background: C.navy,
              border: `${8 * s}px solid ${C.ink}`,
              borderRadius: 32 * s,
              padding: `${14 * s}px ${30 * s}px ${14 * s}px ${20 * s}px`,
              boxShadow: `0 ${10 * s}px 0 ${C.ink}`,
            }}
          >
            <span style={{ fontSize: 64 * s, fontFamily: EMOJI_FONT, lineHeight: 1 }}>✈️</span>
            <span style={{ fontFamily: TITLE_FONT, fontSize: 68 * s, color: C.sun, letterSpacing: 2, lineHeight: 1 }}>BUSH FALLER</span>
          </div>
          {dailyNo && (
            <div
              style={{
                fontFamily: TITLE_FONT,
                fontSize: 40 * s,
                background: C.cream,
                border: `${6 * s}px solid ${C.ink}`,
                borderRadius: 18 * s,
                padding: `${6 * s}px ${20 * s}px`,
                lineHeight: 1.1,
              }}
            >
              DAILY EMBASSY #{dailyNo}
            </div>
          )}
        </div>
        {city && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 * s }}>
            <span style={{ fontSize: 110 * s, fontFamily: FLAG_FONT, lineHeight: 1 }}>{city.flag}</span>
            <span style={{ fontFamily: TITLE_FONT, fontSize: 42 * s, lineHeight: 1 }}>{city.name}</span>
          </div>
        )}
      </div>

      {/* Hero */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: `0 ${pad}px`,
        }}
      >
        <div
          style={{
            width: story ? 480 : 270,
            height: story ? 480 : 270,
            borderRadius: '50%',
            background: C.cream,
            border: `${story ? 14 : 10}px solid ${C.ink}`,
            boxShadow: `0 ${story ? 18 : 12}px 0 ${C.ink}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: story ? 290 : 160,
            fontFamily: EMOJI_FONT,
            lineHeight: 1,
            marginBottom: story ? 56 : 28,
          }}
        >
          {ending.emoji}
        </div>
        <div style={{ fontFamily: TITLE_FONT, fontSize: story ? 124 : 82, lineHeight: 0.98, letterSpacing: 1, maxWidth: width - pad * 2 }}>
          {stripEmoji(ending.title)}
        </div>
        <div style={{ fontWeight: 900, fontSize: story ? 54 : 36, lineHeight: 1.2, marginTop: story ? 28 : 14, maxWidth: story ? 900 : 860 }}>
          {ending.subtitle}
        </div>

        {/* Stat chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: story ? 20 : 14, marginTop: story ? 56 : 28 }}>
          {chips.map((chip) => (
            <span
              key={chip}
              style={{
                background: C.navy,
                color: C.cream,
                fontWeight: 900,
                fontSize: story ? 42 : 30,
                lineHeight: 1,
                padding: story ? '20px 30px' : '14px 22px',
                borderRadius: 999,
                border: `${story ? 6 : 5}px solid ${C.ink}`,
                fontFamily: `${BODY_FONT}, ${EMOJI_FONT}`,
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      {/* URL band: the one thing that must survive a tiny thumbnail */}
      <div
        style={{
          position: 'relative',
          background: C.navy,
          borderTop: `${story ? 12 : 9}px solid ${C.ink}`,
          padding: story ? '44px 40px 56px' : '24px 32px 30px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontFamily: TITLE_FONT, color: C.cream, fontSize: story ? 58 : 38, lineHeight: 1.1 }}>
          Can you do better? 👇
        </div>
        <div style={{ fontFamily: TITLE_FONT, color: C.sun, fontSize: story ? 96 : 66, lineHeight: 1.05, marginTop: story ? 10 : 4, wordBreak: 'break-all' }}>
          {displayUrl(url)}
        </div>
      </div>
    </div>
  );
});
ShareCard.displayName = 'ShareCard';
