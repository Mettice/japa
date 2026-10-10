import React, { Suspense, lazy, useEffect } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { DeliveryScreen } from './screens/DeliveryScreen';
import { CardScreen } from './screens/CardScreen';
import { MiniGameScreen } from './screens/MiniGameScreen';
import { useGameStore } from './store/gameStore';

// Kept out of the initial bundle: the ending pulls in html-to-image + confetti
const loadEndScreen = () => import('./screens/EndScreen');
const EndScreen = lazy(() => loadEndScreen().then((m) => ({ default: m.EndScreen })));
const AboutScreen = lazy(() => import('./screens/AboutScreen'));
// three.js lives in this chunk; fetched when the start screen is idle, not on first paint
const loadRunner = () => import('./runner/RunnerScreen');
const RunnerScreen = lazy(loadRunner);

export const App: React.FC = () => {
  const cityId = useGameStore((s) => s.cityId);
  const pendingMiniGame = useGameStore((s) => s.pendingMiniGame);
  const activeEnding = useGameStore((s) => s.activeEnding);
  const aboutOpen = useGameStore((s) => s.aboutOpen);
  const playStyle = useGameStore((s) => s.playStyle);
  const runId = useGameStore((s) => s.runId);
  const deliveryPhase = useGameStore((s) => s.deliveryPhase);

  // Prefetch the next heavy chunk while the player is idle: the runner from the start
  // screen, the ending during a run
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => (cityId ? loadEndScreen() : loadRunner()));
  }, [cityId]);

  return (
    <div className="w-full h-full min-h-screen bg-navy-950 flex justify-center items-center overflow-hidden">
      {/* Full-window on every device; each screen decides its own layout per breakpoint
          (phone portrait < md ≤ tablet < lg ≤ desktop) */}
      <main className="w-full h-[100dvh] flex flex-col bg-navy-900 relative overflow-hidden app-screen select-none">
        {/* A run always starts by choosing a city */}
        {!cityId ? (
          <HomeScreen />
        ) : (
          <>
            {deliveryPhase && deliveryPhase !== 'street' ? <DeliveryScreen /> : playStyle === 'runner' ? (
              <Suspense fallback={<div className="flex-1 flex items-center justify-center font-title text-sun text-2xl">Loading the street…</div>}>
                {/* Fresh screen + 3D world per run ("Try again" starts a new run in place) */}
                <RunnerScreen key={runId} />
              </Suspense>
            ) : (
              // Swipe cards + mini-games are portrait designs: phone-width column on big screens
              <div className="relative flex-1 min-h-0 w-full max-w-[420px] mx-auto flex flex-col md:border-x-4 border-ink">
                <CardScreen />
                {pendingMiniGame && <MiniGameScreen />}
              </div>
            )}
            {activeEnding && (
              <Suspense fallback={null}>
                <EndScreen />
              </Suspense>
            )}
          </>
        )}
        {aboutOpen && (
          <Suspense fallback={null}>
            <AboutScreen />
          </Suspense>
        )}
      </main>
    </div>
  );
};

export default App;
