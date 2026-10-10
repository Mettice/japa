import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import rawInterview from '../data/interview.json';
import { MiniGameProps } from './types';
import { sound } from '../utils/audio';
import type { Rng } from '../engine/engine';

// A quiz is text-heavy, so this one is DOM rather than canvas: real wrapping + tappable buttons
interface Question {
  id: string;
  question: string;
  answers: string[];
  correct: number;
}

const QUESTION_COUNT = 5;
const SECONDS_PER_QUESTION = 3.5;
const FEEDBACK_MS = 650;

const shuffle = <T,>(items: T[], rng: Rng): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

type Feedback = { chosen: number | null; correct: boolean } | null;

export default function VisaInterview({ rng, onFinish }: MiniGameProps) {
  // Pick and shuffle once; seeded so daily runs get the same interview
  const questions = useMemo(() => {
    const pool = (rawInterview as { questions: Question[] }).questions;
    return shuffle(pool, rng)
      .slice(0, QUESTION_COUNT)
      .map((q) => {
        const order = shuffle([0, 1, 2], rng);
        return { ...q, answers: order.map((i) => q.answers[i]), correct: order.indexOf(q.correct) };
      });
  }, []);

  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);
  const correctCount = useRef(0);
  const slowCount = useRef(0);
  const done = useRef(false);

  const q = questions[index];

  const answer = (chosen: number | null) => {
    if (feedback || done.current) return;
    const correct = chosen === q.correct;
    if (correct) correctCount.current++;
    if (chosen === null) slowCount.current++;
    setFeedback({ chosen, correct });
    if (correct) sound.playClick();
    else sound.playSwipe('left');
    sound.triggerHaptic(correct ? 'light' : 'medium');

    setTimeout(() => {
      if (index + 1 < questions.length) {
        setIndex(index + 1);
        setFeedback(null);
        setTimeLeft(SECONDS_PER_QUESTION);
        return;
      }
      done.current = true;
      const right = correctCount.current;
      const total = questions.length;
      onFinish({
        result: { score: right / total },
        emoji: right === total ? '🛂' : right >= total - 1 ? '😅' : '🛑',
        headline: right === total ? 'Flawless interview!' : `${right}/${total} answers correct`,
        detail:
          right === total
            ? 'The officer almost smiled.'
            : `${total - right - slowCount.current} wrong · ${slowCount.current} too slow`,
      });
    }, FEEDBACK_MS);
  };

  // Per-question countdown; running out counts as a wrong answer
  useEffect(() => {
    if (feedback) return;
    // Wall-clock timer that pauses while the tab is hidden
    let started = performance.now();
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = performance.now();
      else if (hiddenAt !== null) {
        started += performance.now() - hiddenAt;
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    const id = setInterval(() => {
      if (hiddenAt !== null) return;
      const left = SECONDS_PER_QUESTION - (performance.now() - started) / 1000;
      if (left <= 0) {
        clearInterval(id);
        setTimeLeft(0);
        answer(null);
      } else {
        setTimeLeft(left);
      }
    }, 50);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [index, feedback]);

  const pct = timeLeft / SECONDS_PER_QUESTION;

  return (
    <div className="w-full h-full flex flex-col px-5 pt-4 pb-6 bg-navy-900">
      {/* Timer + progress */}
      <div className="h-3.5 rounded-full bg-navy-800 border-[3px] border-ink overflow-hidden">
        <div className={`h-full ${pct < 0.3 ? 'bg-chili' : 'bg-sun'}`} style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="flex justify-center gap-1.5 mt-3">
        {questions.map((_, i) => (
          <span
            key={i}
            className={`w-2.5 h-2.5 rounded-full border-2 border-ink ${i < index ? 'bg-cream' : i === index ? 'bg-sun' : 'bg-navy-700'}`}
          />
        ))}
      </div>

      {/* Officer */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <motion.div
          animate={feedback ? (feedback.correct ? { rotate: [0, -6, 6, 0] } : { x: [0, -10, 10, -6, 0] }) : {}}
          transition={{ duration: 0.4 }}
          className="w-24 h-24 rounded-full bg-sky border-4 border-ink shadow-comic flex items-center justify-center text-6xl leading-none"
        >
          {feedback ? (feedback.correct ? '🙂' : '😠') : '🧐'}
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.div
            key={q.id}
            initial={{ scale: 0.85, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 28 }}
            className="relative mt-5 bg-cream text-ink rounded-3xl border-4 border-ink shadow-comic px-5 py-4 text-center"
          >
            {/* Speech tail */}
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 w-5 h-5 bg-cream border-l-4 border-t-4 border-ink rotate-45" />
            <p className="font-title text-2xl leading-tight">{q.question}</p>
          </motion.div>
        </AnimatePresence>
        <div className="h-8 mt-2 font-title text-xl">
          {feedback && (
            <span className={feedback.correct ? 'text-leaf' : 'text-chili'}>
              {feedback.correct ? '✅ Correct' : feedback.chosen === null ? '⏰ Too slow!' : '❌ Wrong'}
            </span>
          )}
        </div>
      </div>

      {/* Answers */}
      <div className="flex flex-col gap-3">
        {q.answers.map((text, i) => {
          const isCorrect = feedback && i === q.correct;
          const isWrongPick = feedback && i === feedback.chosen && !feedback.correct;
          return (
            <motion.button
              key={`${q.id}-${i}`}
              initial={{ x: i % 2 ? 40 : -40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 500, damping: 30 }}
              onClick={() => answer(i)}
              disabled={!!feedback}
              className={`press min-h-[60px] rounded-2xl border-[3px] border-ink shadow-comic px-4 py-2 font-extrabold text-[16px] leading-tight text-left ${
                isCorrect ? 'bg-leaf text-ink' : isWrongPick ? 'bg-chili text-cream' : 'bg-navy-700 text-cream'
              }`}
            >
              {text}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
