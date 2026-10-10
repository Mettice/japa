import type { Rng } from '../engine/engine';
import type { MiniGameResult } from '../types/game';

export interface MiniGameOutcome {
  result: MiniGameResult;
  emoji: string;
  headline: string;
  detail: string;
}

// Mounted after the 3-2-1 countdown; must call onFinish exactly once
export interface MiniGameProps {
  rng: Rng;
  onFinish: (outcome: MiniGameOutcome) => void;
}
