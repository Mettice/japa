import { City, Ending, Stage, StatKey } from '../types/game';
import rawConfig from '../data/config.json';

// Public game URL printed on share cards and in captions. First match wins:
// config.json "shareUrl" → VITE_SHARE_URL env var → the page's own origin (the real
// domain once deployed; localhost only while developing)
export const shareUrl = (): string =>
  (rawConfig as { shareUrl?: string }).shareUrl || import.meta.env.VITE_SHARE_URL || window.location.origin;

export const isLocalUrl = (url: string) => /^https?:\/\/(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.|\[::1\])/.test(url);

// "https://bushfaller.app/" → "bushfaller.app" for printing on the card
export const displayUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

export const BAR_META: Record<StatKey, { icon: string; label: string }> = {
  money: { icon: '💰', label: 'Money' },
  papers: { icon: '📄', label: 'Papers' },
  morale: { icon: '🙂', label: 'Morale' },
  familyPressure: { icon: '👨‍👩‍👧', label: 'Family' },
};

export interface RunSummary {
  ending: Ending;
  city: City | null;
  stageReached: number; // 1-based
  stageCount: number;
  stageName: string;
  cardsSurvived: number;
  dailyNo: number | null;
}

export const summarizeRun = (
  ending: Ending,
  city: City | null,
  stages: Stage[],
  currentStageIndex: number,
  cardsSwiped: number,
  dailyNo: number | null,
): RunSummary => ({
  ending,
  city,
  stageReached: currentStageIndex + 1,
  stageCount: stages.length,
  stageName: stages[currentStageIndex]?.name ?? '',
  // The swipe that killed you doesn't count as survived
  cardsSurvived: ending.type === 'victory' ? cardsSwiped : Math.max(0, cardsSwiped - 1),
  dailyNo,
});

// Third chip: what ended the run
export const causeChip = (ending: Ending): string => {
  if (ending.type === 'victory') return '❄️ Reached Europe';
  if (!ending.statKey) return ending.badge;
  const { icon, label } = BAR_META[ending.statKey];
  return `${icon} ${label} hit ${ending.statValue === 0 ? '0' : '100'}`;
};

export const shareText = (run: RunSummary, url: string): string => {
  const { ending, dailyNo } = run;
  const lead =
    ending.type === 'victory'
      ? `I made it to Europe ${ending.emoji}`
      : `I tried to japa and reached stage ${run.stageReached}/${run.stageCount}… then ${ending.title} ${ending.emoji}`;
  const daily = dailyNo ? ` Daily Embassy #${dailyNo}.` : '';
  return `${lead}${daily} Can you do better? ${url}`;
};
