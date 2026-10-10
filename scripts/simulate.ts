// Balance simulation + data checks. Run: npm run sim  (or: node scripts/simulate.ts [runs])
// Exits non-zero when card rules are broken or balance drifts outside the targets below.
import { readFileSync } from 'node:fs';
import { createRun, currentCard, dailyCityId, dailySeed, mulberry32, resolveMiniGame, localizeText, stagePool, cardsPerStage, getCity, step, STAT_KEYS } from '../src/engine/engine.ts';
import type { GameData, RunState, Rng } from '../src/engine/engine.ts';
import type { Card, Choice, GameStats } from '../src/types/game.ts';

const RUNS = Number(process.argv[2]) || 1000;

// Targets: random swiping ≈60% reach stage 3; a careful player averages stage 4+
// Targets. Nobody dies before card graceCards+1, and there's no "death wall": no single
// card ends more than 15% of random runs. Random swiping reaches stage 4 about 2/3 of the
// time; a careful player averages stage 4+.
const TARGET_RANDOM_STAGE4 = { min: 0.6, max: 0.75 };
const MAX_DEATHS_ON_ONE_CARD = 0.15;
const TARGET_CAREFUL_AVG_STAGE = 4;

const load = (name: string) => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf-8'));
const data: GameData = {
  cards: load('cards'),
  endings: load('endings'),
  stages: load('stages'),
  characters: load('characters'),
  cities: load('cities'),
  config: load('config'),
};

// ---------- Data checks ----------

const errors: string[] = [];
const warnings: string[] = [];
// familyPressure going up is bad for the player; every other bar going up is good
const isGood = (key: string, v: number) => (key === 'familyPressure' ? v < 0 : v > 0);

let effectCount = 0;
let bigCount = 0;
const checkChoice = (card: Card, side: string, choice: Choice) => {
  const entries = Object.entries(choice.effects).filter(([, v]) => v);
  const where = `${card.id}.${side}`;
  if (entries.length === 0) errors.push(`${where}: no effects`);
  if (entries.length > 3) errors.push(`${where}: moves ${entries.length} bars (max 3)`);
  if (!entries.some(([k, v]) => isGood(k, v!))) errors.push(`${where}: no upside (all-down choice)`);
  if (!entries.some(([k, v]) => !isGood(k, v!))) errors.push(`${where}: no downside (free choice)`);
  for (const [k, v] of entries) {
    effectCount++;
    if (Math.abs(v!) > 25) errors.push(`${where}: ${k} ${v} exceeds ±25`);
    if (Math.abs(v!) > 15) bigCount++;
  }
};

const characterIds = new Set(data.characters.map((c) => c.id));
const cityIds = new Set(data.cities.map((c) => c.id));
const stageIds = new Set(data.stages.map((s) => s.id));
const LITERAL_CURRENCY = /₦|FCFA|GH₵|\bNaira\b|\bcedis?\b|\bCFA\b/;

for (const card of data.cards) {
  if (!characterIds.has(card.characterId)) errors.push(`${card.id}: unknown character ${card.characterId}`);
  if (!stageIds.has(card.stageId)) errors.push(`${card.id}: unknown stage ${card.stageId}`);
  for (const c of card.cities || []) if (!cityIds.has(c)) errors.push(`${card.id}: unknown city ${c}`);
  checkChoice(card, 'left', card.leftChoice);
  checkChoice(card, 'right', card.rightChoice);
}
if (bigCount / effectCount > 0.15) warnings.push(`${bigCount}/${effectCount} effects are above ±15 (should be rare)`);

// Currency/places must come from the city: no hardcoded currency, no unresolved placeholders
const texts = [
  ...data.cards.flatMap((c) => [c.situation, c.leftChoice.text, c.rightChoice.text]),
  ...data.endings.flatMap((e) => [e.title, e.subtitle, e.description, e.shareTitle, e.shareQuote]),
  ...data.stages.flatMap((s) => [s.city, s.tagline]),
  ...data.characters.map((c) => c.role),
];
for (const text of texts) {
  if (LITERAL_CURRENCY.test(text)) errors.push(`hardcoded local currency: "${text.slice(0, 60)}..."`);
  for (const city of data.cities) {
    const out = localizeText(text, city, data);
    if (/\{[^}]*\}/.test(out)) errors.push(`unresolved placeholder for ${city.id}: "${out.slice(0, 60)}..."`);
  }
}

for (const city of data.cities) {
  for (const stage of data.stages) {
    const pool = stagePool(data, stage.id, city.id).length;
    const n = cardsPerStage(stage, data);
    if (pool < n) errors.push(`${city.id}/${stage.id}: pool has ${pool} cards, needs ${n}`);
  }
  const local = data.cards.filter((c) => c.cities?.includes(city.id)).length;
  if (city.id !== 'lagos' && local < 8) errors.push(`${city.id}: only ${local} city-specific cards (need 8)`);
}

// ---------- Stage progression ----------
// Zero all effects so nobody dies, then check stages advance after exactly N cards (incl. a per-stage override)
{
  const neutral = (c: Card): Card => ({ ...c, leftChoice: { ...c.leftChoice, effects: {} }, rightChoice: { ...c.rightChoice, effects: {} } });
  for (const [defaultN, override] of [[3, null], [2, 3], [1, 2]] as const) {
    const testData: GameData = {
      ...data,
      cards: data.cards.map(neutral),
      config: { ...data.config, cardsPerStage: defaultN },
      stages: data.stages.map((s, i) => (i === 1 && override ? { ...s, cardsPerStage: override } : s)),
    };
    for (const city of data.cities) {
      const rng = mulberry32(99);
      let run = createRun(testData, city.id, rng);
      const seen: number[] = [];
      const miniGames: number[] = [];
      while (!run.activeEnding) {
        if (run.pendingMiniGame) {
          miniGames.push(run.currentStageIndex);
          if (step(testData, run, 'left', rng) !== run) errors.push(`${city.id}: card played while a mini-game was pending`);
          run = resolveMiniGame(testData, run, { score: 1 });
          continue;
        }
        seen[run.currentStageIndex] = (seen[run.currentStageIndex] || 0) + 1;
        run = step(testData, run, 'left', rng);
      }
      const expected = testData.stages.map((s) => cardsPerStage(s, testData));
      const label = `progression N=${defaultN}${override ? ` (stage 2 → ${override})` : ''} ${city.id}`;
      if (seen.join() !== expected.join()) errors.push(`${label}: cards per stage ${seen.join('/')} expected ${expected.join('/')}`);
      if (run.activeEnding?.type !== 'victory') errors.push(`${label}: ended with ${run.activeEnding?.id}, expected victory`);
      const expectedMiniGames = testData.stages.flatMap((s, i) => (s.miniGame ? [i] : []));
      if (miniGames.join() !== expectedMiniGames.join()) errors.push(`${label}: mini-games at stages ${miniGames.join('/')} expected ${expectedMiniGames.join('/')}`);
      const ids = new Set<string>();
      run = createRun(testData, city.id, mulberry32(5));
      while (!run.activeEnding) {
        if (run.pendingMiniGame) {
          run = resolveMiniGame(testData, run, { score: 1 });
          continue;
        }
        const card = currentCard(run)!;
        if (ids.has(card.id)) errors.push(`${label}: card ${card.id} dealt twice`);
        ids.add(card.id);
        run = step(testData, run, 'right', rng);
      }
    }
  }
  console.log(errors.some((e) => e.startsWith('progression')) ? 'stage progression: FAILED' : 'stage progression: OK (N=3, N=2 with override 3, N=1 with override 2; mini-games at stages 3/4/6; all cities)');
}

// ---------- Daily run ----------
// Same UTC day → same city, seed and deck for everyone; a different day → a different seed
{
  const morning = new Date('2026-10-08T00:05:00Z');
  const night = new Date('2026-10-08T23:55:00Z');
  const tomorrow = new Date('2026-10-09T00:05:00Z');
  const deck = (date: Date) => {
    const run = createRun(data, dailyCityId(data, date), mulberry32(dailySeed(date)));
    return [run.cityId, ...run.stageCards.map((c) => c.id), ...run.upcomingStageCards.map((c) => c.id)].join();
  };
  if (dailySeed(morning) !== dailySeed(night) || deck(morning) !== deck(night)) errors.push('daily: same UTC day produced different runs');
  if (dailySeed(morning) === dailySeed(tomorrow)) errors.push('daily: consecutive days share a seed');
  console.log(errors.some((e) => e.startsWith('daily')) ? 'daily seed: FAILED' : 'daily seed: OK (deterministic per UTC day)');
}

// ---------- Early-run safety net ----------
// A brutal stage-1 card: the hit must be capped, and no ending may fire during the grace cards
{
  const { graceCards, graceFloor, stageOneMaxHit } = data.config;
  const brutal: Card = {
    id: 'test_brutal',
    stageId: data.stages[0].id,
    characterId: data.characters[0].id,
    situation: 'test',
    leftChoice: { text: 'test', effects: { money: -60 } },
    rightChoice: { text: 'test', effects: { money: -60 } },
  };
  const testData: GameData = { ...data, cards: [brutal] };
  let run = { ...createRun(testData, data.cities[0].id, mulberry32(1)), stageCards: Array(graceCards + 1).fill(brutal) };
  const start = run.stats.money;
  run = step(testData, run, 'left');
  const capped = start - run.stats.money;
  if (capped > stageOneMaxHit) errors.push(`stage-1 cap: a −60 card took ${capped} (max ${stageOneMaxHit})`);
  for (let i = 1; i < graceCards; i++) run = step(testData, run, 'left');
  if (run.activeEnding) errors.push(`grace: ended on card ${run.cardsSwiped} (no ending before card ${graceCards + 1})`);
  if (run.stats.money !== graceFloor) errors.push(`grace: money ${run.stats.money} during grace, expected floor ${graceFloor}`);
  run = step(testData, run, 'left');
  if (!run.activeEnding) errors.push(`grace: card ${graceCards + 1} should be able to end the run`);
  console.log(errors.some((e) => /^(stage-1|grace)/.test(e)) ? 'early safety net: FAILED' : `early safety net: OK (stage-1 hits capped at ${stageOneMaxHit}, no ending before card ${graceCards + 1})`);
}

// ---------- Simulation ----------

interface Policy {
  choose: (run: RunState, rng: Rng) => 'left' | 'right';
  miniGameScore: (rng: Rng) => number; // 0..1
}

const randomPolicy: Policy = {
  choose: (_, rng) => (rng() < 0.5 ? 'left' : 'right'),
  miniGameScore: (rng) => rng(),
};

// Stand-in for a sensible human: keep the bar closest to an edge as far from it as possible
const danger = (stats: GameStats) => Math.min(...STAT_KEYS.map((k) => Math.min(stats[k], 100 - stats[k])));
const carefulChoose: Policy['choose'] = (run, rng) => {
  const card = currentCard(run)!;
  const after = (choice: Choice) => {
    const s = { ...run.stats };
    for (const k of STAT_KEYS) s[k] = Math.max(0, Math.min(100, s[k] + (choice.effects[k] || 0)));
    return danger(s);
  };
  const l = after(card.leftChoice);
  const r = after(card.rightChoice);
  if (l === r) return rng() < 0.5 ? 'left' : 'right';
  return l > r ? 'left' : 'right';
};
// A decent player scores in the top half of every mini-game
const carefulPolicy: Policy = { choose: carefulChoose, miniGameScore: (rng) => 0.5 + 0.5 * rng() };

interface Report {
  runs: number;
  avgCardsSurvived: number;
  avgStageReached: number;
  deathCard: number[]; // fraction of runs dying on card i (deaths only)
  earliestDeath: number;
  reachedStage: number[]; // fraction reaching stage i+1
  endings: Record<string, number>;
}

const simulate = (policy: Policy, cityId: string | null, seed: number): Report => {
  const rng = mulberry32(seed);
  const stageCount = data.stages.length;
  const reached = new Array(stageCount).fill(0);
  const endings: Record<string, number> = {};
  let survived = 0;
  let stageSum = 0;
  const deathCard: number[] = [];
  let earliestDeath = Infinity;

  for (let i = 0; i < RUNS; i++) {
    const city = cityId ?? data.cities[i % data.cities.length].id;
    let run = createRun(data, city, rng);
    let diedInMiniGame = false;
    while (!run.activeEnding) {
      if (run.pendingMiniGame) {
        run = resolveMiniGame(data, run, { score: policy.miniGameScore(rng), penalties: Math.floor(rng() * 3) });
        diedInMiniGame = !!run.activeEnding;
      } else {
        run = step(data, run, policy.choose(run, rng), rng);
      }
    }

    const ending = run.activeEnding!;
    const won = ending.type === 'victory';
    survived += won || diedInMiniGame ? run.cardsSwiped : run.cardsSwiped - 1;
    stageSum += run.currentStageIndex + 1;
    for (let s = 0; s <= run.currentStageIndex; s++) reached[s]++;
    endings[ending.id] = (endings[ending.id] || 0) + 1;
    if (!won) {
      deathCard[run.cardsSwiped] = (deathCard[run.cardsSwiped] || 0) + 1;
      earliestDeath = Math.min(earliestDeath, run.cardsSwiped);
    }
  }

  return {
    runs: RUNS,
    avgCardsSurvived: survived / RUNS,
    avgStageReached: stageSum / RUNS,
    reachedStage: reached.map((n) => n / RUNS),
    endings,
    deathCard: Array.from({ length: deathCard.length }, (_, i) => (deathCard[i] || 0) / RUNS),
    earliestDeath,
  };
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(6);

const print = (label: string, r: Report) => {
  const worst = r.deathCard.reduce((best, v, i) => (v > r.deathCard[best] ? i : best), 0);
  console.log(`
--- deaths by card: earliest #${r.earliestDeath}, worst #${worst} (${pct(r.deathCard[worst] || 0).trim()}) ---`);
  console.log(r.deathCard.map((v, i) => (v ? `${i}:${(v * 100).toFixed(0)}%` : '')).filter(Boolean).join(' '));
  console.log(`\n=== ${label} (${r.runs} runs) ===`);
  console.log(`avg cards survived: ${r.avgCardsSurvived.toFixed(1)}   avg stage reached: ${r.avgStageReached.toFixed(2)}`);
  console.log('reached stage: ' + r.reachedStage.map((v, i) => `${i + 1}:${pct(v)}`).join('  '));
  const sorted = Object.entries(r.endings).sort((a, b) => b[1] - a[1]);
  console.log('endings: ' + sorted.map(([id, n]) => `${id} ${pct(n / r.runs).trim()}`).join(', '));
};

const totalCards = data.stages.reduce((sum, s) => sum + cardsPerStage(s, data), 0);
console.log(`Bush Faller balance sim: ${data.stages.length} stages, ${totalCards} cards per run, start stats ${JSON.stringify(data.config.initialStats)}`);
console.log(`cards: ${data.cards.length} total; big effects (>±15): ${bigCount}/${effectCount}`);

const random = simulate(randomPolicy, null, 1);
const careful = simulate(carefulPolicy, null, 2);
print('Random swiping, all cities', random);
print('Careful player, all cities', careful);
for (const city of data.cities) {
  const r = simulate(randomPolicy, city.id, 3);
  console.log(`  random ${getCity(data, city.id).name.padEnd(7)} stage4+ ${pct(r.reachedStage[3])}  avg stage ${r.avgStageReached.toFixed(2)}  victory ${pct((r.endings.victory_winter || 0) / r.runs)}`);
}

const stage4 = random.reachedStage[3];
if (stage4 < TARGET_RANDOM_STAGE4.min || stage4 > TARGET_RANDOM_STAGE4.max) {
  errors.push(`random runs reaching stage 4+: ${pct(stage4).trim()} (target ${pct(TARGET_RANDOM_STAGE4.min).trim()}–${pct(TARGET_RANDOM_STAGE4.max).trim()})`);
}
for (const [label, r] of [['random', random], ['careful', careful]] as const) {
  if (r.earliestDeath <= data.config.graceCards) {
    errors.push(`${label}: a run died on card ${r.earliestDeath}; no ending may trigger before card ${data.config.graceCards + 1}`);
  }
  const worst = Math.max(...r.deathCard.map((v) => v || 0));
  if (worst > MAX_DEATHS_ON_ONE_CARD) {
    errors.push(`${label}: ${pct(worst).trim()} of runs die on card #${r.deathCard.indexOf(worst)} (max ${pct(MAX_DEATHS_ON_ONE_CARD).trim()}: death wall)`);
  }
}
if (careful.avgStageReached < TARGET_CAREFUL_AVG_STAGE) {
  errors.push(`careful player avg stage ${careful.avgStageReached.toFixed(2)} (target ≥ ${TARGET_CAREFUL_AVG_STAGE})`);
}

for (const w of warnings) console.log(`WARN  ${w}`);
for (const e of errors) console.log(`FAIL  ${e}`);
console.log(errors.length ? `\n${errors.length} problem(s)` : '\nAll checks passed');
process.exit(errors.length ? 1 : 0);
