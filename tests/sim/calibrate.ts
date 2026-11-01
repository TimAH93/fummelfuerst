import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { TrackId } from '../../src/core/curriculum/curriculum';
import { DEFAULT_CONTEXT } from '../../src/core/exercises';
import { DEFAULT_MODEL, ModelConfig } from '../../src/core/mastery/config';
import { TRANSFER_S, TransferStrengths } from '../../src/core/mastery/relations';
import { formatTable, runBaseline } from './baseline';
import { Driver, v2Driver } from './drivers';
import { buildReport } from './metrics';
import { personaById } from './persona';
import { runTrace } from './run';

/**
 * `npm run calibrate` (spec §9.5, outside `npm test`): fits the tunable constants of the v2
 * learner model against the simulated learners. The objective is
 *
 *   J = 3·falsePassRate + 2·underScheduled + overScheduled + mean(|ttp − target| / target) + 2·calibration
 *
 * over the personas steady (fretboard and intervals), quick, foundOnly, forgetful and optimist,
 * on seeds 11–15 – the acceptance tests run seeds 1–5, so the pinned thresholds are checked out
 * of sample. `calibration` is the mean of |knowledge − k| and |recall − R|; a drill that was
 * started but not passed counts as censored (only answers beyond its target are an error), so a
 * strict model cannot hide its slowness by passing nothing. Coordinate descent walks the
 * constants of §9.5 one at a time over a small grid (each coordinate's candidates are evaluated
 * in parallel worker threads, with common seeds), keeps a move only when J drops by more than
 * MIN_GAIN, and stops after a pass without a move or when the time budget is spent. The
 * principles (comfortMastery, comfortN, heldGap, slipProgress, helpUpStreak, helpDownMisses) are
 * never touched. It prints the J breakdown, the winning constants and the per-persona metric
 * table (seeds 1–5) for the current DEFAULT_MODEL and for the winner.
 *
 *   npm run calibrate                      # descent from DEFAULT_MODEL, test-pinned constants held
 *   npm run calibrate -- --free            # also sweep the constants other tests pin (report only)
 *   npm run calibrate -- --passes=1 --budget=120 --workers=4
 */

const MIN = 60_000;

/** Seeds of the descent (the acceptance tests use 1–5). */
export const CALIBRATION_SEEDS = [11, 12, 13, 14, 15];

/** Where each persona of J is measured. */
export const J_SCENARIOS: readonly { persona: string; track: TrackId; days: number }[] = [
  { persona: 'steady', track: 'fretboard', days: 28 },
  { persona: 'steady', track: 'intervals', days: 28 },
  { persona: 'quick', track: 'fretboard', days: 28 },
  { persona: 'foundOnly', track: 'fretboard', days: 28 },
  { persona: 'forgetful', track: 'fretboard', days: 28 },
  { persona: 'optimist', track: 'fretboard', days: 28 },
];

/** A move must lower J by more than this to be kept (five seeds are noisy; ties keep the old value). */
export const MIN_GAIN = 0.01;

/** Target answers to pass a drill of n skills (spec §9.5: 1 → 10, 4 → 35, 7 → 55, 12 → 90), linear in between. */
const TTP_POINTS: readonly [number, number][] = [[1, 10], [4, 35], [7, 55], [12, 90]];

export function ttpTarget(size: number): number {
  if (size <= TTP_POINTS[0][0]) return TTP_POINTS[0][1];
  for (let i = 1; i < TTP_POINTS.length; i++) {
    const [x0, y0] = TTP_POINTS[i - 1], [x1, y1] = TTP_POINTS[i];
    if (size <= x1) return y0 + ((y1 - y0) * (size - x0)) / (x1 - x0);
  }
  const [xa, ya] = TTP_POINTS[TTP_POINTS.length - 2], [xb, yb] = TTP_POINTS[TTP_POINTS.length - 1];
  return yb + ((yb - ya) * (size - xb)) / (xb - xa);
}

/** What the descent varies: the model config and the transfer strengths. */
export interface Candidate {
  cfg: ModelConfig;
  strengths: TransferStrengths;
}

/** One run's share of J. */
interface RunScore {
  passes: number;
  falsePasses: number;
  under: number | null;
  over: number;
  ttpErr: number[];
  calK: number | null;
  calR: number | null;
}

/** J and its terms (all means over runs; falsePassRate pooled over every pass). */
export interface Objective {
  J: number;
  falsePassRate: number;
  underScheduled: number;
  overScheduled: number;
  ttpError: number;
  calibration: number;
  calK: number;
  calR: number;
  passes: number;
}

export function scoreRun(driver: Driver, sc: (typeof J_SCENARIOS)[number], seed: number): RunScore {
  const trace = runTrace(personaById(sc.persona), sc.track, sc.days, seed, driver);
  const r = buildReport(trace);
  const size = new Map(driver.curriculum.map((d) => [d.id, d.skills.length]));
  const ttpErr = Object.entries(r.timeToPass).map(([id, t]) => {
    const target = ttpTarget(size.get(id)!);
    return Math.abs(t.answers - target) / target;
  });
  // Censored: started but not passed – only the answers beyond the target are known to be an error.
  const own = new Map<string, number>();
  for (const p of trace.picks) if (!p.review) own.set(p.drill, (own.get(p.drill) ?? 0) + 1);
  for (const [id, n] of own) {
    if (r.timeToPass[id]) continue;
    const target = ttpTarget(size.get(id)!);
    ttpErr.push(Math.max(0, n - target) / target);
  }
  return {
    passes: r.passed.length, falsePasses: r.falsePasses.length, under: r.underScheduled, over: r.overScheduled,
    ttpErr, calK: r.calibration?.knowledge ?? null, calR: r.calibration?.recall ?? null,
  };
}

const meanOf = (xs: (number | null)[]): number => {
  const ys = xs.filter((x): x is number => x !== null);
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
};

export function combine(runs: RunScore[]): Objective {
  const passes = runs.reduce((a, r) => a + r.passes, 0);
  const falsePassRate = passes ? runs.reduce((a, r) => a + r.falsePasses, 0) / passes : 0;
  const underScheduled = meanOf(runs.map((r) => r.under));
  const overScheduled = meanOf(runs.map((r) => r.over));
  const ttpError = meanOf(runs.flatMap((r) => r.ttpErr));
  const calK = meanOf(runs.map((r) => r.calK));
  const calR = meanOf(runs.map((r) => r.calR));
  const calibration = (calK + calR) / 2;
  const J = 3 * falsePassRate + 2 * underScheduled + overScheduled + ttpError + 2 * calibration;
  return { J, falsePassRate, underScheduled, overScheduled, ttpError, calibration, calK, calR, passes };
}

/** J of one candidate over the J personas and the given seeds (single-threaded). */
export function objective(c: Candidate, seeds: readonly number[] = CALIBRATION_SEEDS): Objective {
  const driver = v2Driver(DEFAULT_CONTEXT, { cfg: c.cfg, strengths: c.strengths });
  const runs: RunScore[] = [];
  for (const sc of J_SCENARIOS) for (const seed of seeds) runs.push(scoreRun(driver, sc, seed));
  return combine(runs);
}

// ── The grid ──

/** Principles: never swept (spec §9.5). */
export const PRINCIPLES: readonly (keyof ModelConfig)[] = ['comfortMastery', 'comfortN', 'heldGap', 'slipProgress', 'helpUpStreak', 'helpDownMisses'];

interface Coordinate {
  name: string;
  values: readonly unknown[];
  get(c: Candidate): unknown;
  set(c: Candidate, v: unknown): Candidate;
  /** Another package's test pins this value: swept only with --free, and then reported, not committed. */
  pinnedBy?: string;
}

const cfgKey = <K extends keyof ModelConfig>(key: K, values: readonly ModelConfig[K][], pinnedBy?: string): Coordinate => ({
  name: key, values, pinnedBy,
  get: (c) => c.cfg[key],
  set: (c, v) => ({ ...c, cfg: { ...c.cfg, [key]: v } }),
});
const weightKey = (key: keyof ModelConfig['weights'], values: readonly number[]): Coordinate => ({
  name: `weights.${key}`, values,
  get: (c) => c.cfg.weights[key],
  set: (c, v) => ({ ...c, cfg: { ...c.cfg, weights: { ...c.cfg.weights, [key]: v as number } } }),
});
const strengthKey = <K extends keyof TransferStrengths>(key: K, values: readonly TransferStrengths[K][], pinnedBy?: string): Coordinate => ({
  name: `TRANSFER_S.${String(key)}`, values, pinnedBy,
  get: (c) => c.strengths[key],
  set: (c, v) => ({ ...c, strengths: { ...c.strengths, [key]: v } }),
});

/**
 * The constants of §9.5 with a small grid each (the current value is always one point). Only the
 * fretboard and intervals tracks are in J, so strengths of triad, keys, voicing and melody edges
 * and the play weights are not identifiable here and keep their spec values. maxLearningDrill
 * stops at 4 on purpose: the simulated learner has no interference cost, so J would always ask
 * for more skills in parallel than "one thing at a time" allows.
 */
export const COORDINATES: readonly Coordinate[] = [
  cfgKey('helpW', [[0.7, 0.85, 1, 1], [0.85, 0.95, 1, 1], [0.9, 1, 1, 1], [1, 1, 1, 1], [0.55, 0.75, 1, 1]]),
  cfgKey('maxLearningDrill', [2, 3, 4]),
  cfgKey('learningDone', [0.4, 0.45, 0.5, 0.55, 0.6, 0.7]),
  cfgKey('nMax', [18, 20, 25, 30]),
  cfgKey('nLapse', [8, 12, 16, 20, 25, 30]),
  weightKey('weak', [0.5, 1, 2]),
  weightKey('forget', [0.4, 0.8, 1.6]),
  weightKey('fresh', [0.3, 0.6, 1.2]),
  weightKey('floor', [0.01, 0.03, 0.1]),
  weightKey('recent', [0.05, 0.1, 0.3, 0.5]),
  weightKey('boost', [2, 3, 5]),
  weightKey('ladderSecond', [0.1, 0.15, 0.3, 0.6]),
  cfgKey('rTarget', [0.4, 0.6, 0.8]),
  cfgKey('fluFloor', [0.5, 0.75, 1]),
  cfgKey('hlGain', [1, 2, 3]),
  cfgKey('hlGainCap', [1.5, 2, 3, 5]),
  cfgKey('hlDemo', [0.25, 0.5, 0.75]),
  cfgKey('missShrink', [0.1, 0.2, 0.35]),
  cfgKey('missFloor', [0.25, 0.5, 0.75]),
  cfgKey('priorMax', [2, 4, 6]),
  cfgKey('ladderTransfer', [0, 0.5, 1]),
  cfgKey('lapsePenalty', [[1, 0.85, 0.6, 0.3], [1, 0.9, 0.7, 0.4], [1, 0.8, 0.5, 0.2]]),
  // helpUp[2] stays ≤ 0.85: a p = 0.97 player must still reach "sound only" (Beta low of 20.4/1.6 ≈ 0.87).
  cfgKey('helpUp', [[0.5, 0.65, 0.8], [0.4, 0.55, 0.7], [0.55, 0.7, 0.85], [0.6, 0.75, 0.85], [0.6, 0.7, 0.8]]),
  cfgKey('boostMs', [10 * MIN, 20 * MIN, 40 * MIN]),
  cfgKey('mixMax', [0.5, 0.6]), // tests/mix.test.ts needs 0.475 ≤ mixMax ≤ 0.625
  strengthKey('mirror', [0.6, 0.8, 0.9]),
  strengthKey('same-shape', [0.4, 0.6, 0.8]),
  strengthKey('fret-neighbour', [0.1, 0.3, 0.5]),
  strengthKey('degree-neighbour', [0.1, 0.2, 0.3]),
  // Pinned by other packages' tests: swept only with --free.
  cfgKey('hl0', [5 * MIN, 10 * MIN, 20 * MIN], 'tests/migrate.test.ts (box-0 skill → hl 10 min)'),
  cfgKey('mixBase', [0.15, 0.25, 0.35], 'tests/mix.test.ts (pMix 0.25 + 0.25·0.2)'),
  cfgKey('warmupN', [3, 5, 7], 'tests/mix.test.ts (five warm-up picks)'),
  strengthKey('octave-string', [0.6, 0.8, 0.9], 'tests/relations.test.ts (s 0.8)'),
  strengthKey('samePc', [[0.2, 0.3, 0.15, 0.15], [0.3, 0.45, 0.2, 0.2], [0.4, 0.6, 0.3, 0.3]], 'tests/relations.test.ts (0.3 / 0.45 / 0.2)'),
];

/**
 * Combinations the model's semantics rule out: the lapse window is the one *after a miss*, so it
 * is never wider than the success window (nLapse = nMax: a miss shrinks nothing extra), and a
 * migrated v1 skill with 18 answers keeps its count (tests/migrate.test.ts: nMax ≥ 18).
 */
export const valid = (c: Candidate): boolean => c.cfg.nLapse <= c.cfg.nMax && c.cfg.nMax >= 18 && c.cfg.mixBase <= c.cfg.mixMax;

for (const c of COORDINATES) if ((PRINCIPLES as readonly string[]).includes(c.name)) throw new Error(`${c.name} is a principle`);

// ── Worker pool ──

/**
 * A worker running this file. tsx's loader hooks do not reach worker threads on their own, so
 * the worker registers them (tsx/esm/api) before importing the TypeScript module.
 */
function spawnWorker(): Worker {
  const boot = `import('tsx/esm/api').then((api) => { api.register(); return import(${JSON.stringify(import.meta.url)}); });`;
  return new Worker(boot, { eval: true });
}

interface Job { id: number; cand: Candidate; seeds: readonly number[] }

class Pool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly queue: { job: Job; done: (o: Objective) => void }[] = [];
  private readonly pending = new Map<number, (o: Objective) => void>();
  private next = 0;

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const w = spawnWorker();
      w.on('message', (m: { id: number; obj: Objective }) => {
        this.pending.get(m.id)!(m.obj);
        this.pending.delete(m.id);
        this.idle.push(w);
        this.drain();
      });
      w.on('error', (e) => { throw e; });
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  run(cand: Candidate, seeds: readonly number[]): Promise<Objective> {
    return new Promise((done) => {
      this.queue.push({ job: { id: this.next++, cand, seeds }, done });
      this.drain();
    });
  }

  private drain(): void {
    while (this.idle.length && this.queue.length) {
      const w = this.idle.pop()!;
      const { job, done } = this.queue.shift()!;
      this.pending.set(job.id, done);
      w.postMessage(job);
    }
  }

  close(): Promise<number[]> {
    return Promise.all(this.workers.map((w) => w.terminate()));
  }
}

// ── Descent ──

const key = (v: unknown): string => JSON.stringify(v);
const fmt = (x: number): string => x.toFixed(3);
const show = (o: Objective): string =>
  `J ${fmt(o.J)} = 3·fpr ${fmt(o.falsePassRate)} + 2·under ${fmt(o.underScheduled)} + over ${fmt(o.overScheduled)} + ttp ${fmt(o.ttpError)} + 2·cal ${fmt(o.calibration)} (k ${fmt(o.calK)}, R ${fmt(o.calR)}; ${o.passes} passes)`;
const showValue = (v: unknown): string => (typeof v === 'number' && v >= MIN && v % MIN === 0 ? `${v / MIN} min` : key(v));

export interface DescentOptions {
  passes: number;
  budgetMs: number;
  workers: number;
  free: boolean;
  seeds: readonly number[];
  log: (line: string) => void;
}

export async function descend(start: Candidate, o: DescentOptions): Promise<{ best: Candidate; obj: Objective; start: Objective; moves: string[] }> {
  const pool = new Pool(o.workers);
  const t0 = performance.now();
  const coords = COORDINATES.filter((c) => o.free || !c.pinnedBy);
  let best = start;
  let obj = await pool.run(best, o.seeds);
  const first = obj;
  const moves: string[] = [];
  o.log(`start: ${show(obj)}`);
  for (let pass = 1; pass <= o.passes; pass++) {
    let moved = false;
    for (const c of coords) {
      if (performance.now() - t0 > o.budgetMs) break;
      const current = key(c.get(best));
      const cands = c.values.filter((v) => key(v) !== current).map((v) => ({ v, cand: c.set(best, v) })).filter((x) => valid(x.cand));
      if (cands.length === 0) continue;
      const scored = await Promise.all(cands.map(async (x) => ({ ...x, obj: await pool.run(x.cand, o.seeds) })));
      const top = scored.reduce((p, q) => (q.obj.J < p.obj.J ? q : p), scored[0]);
      const line = `pass ${pass} ${c.name.padEnd(28)} ${showValue(c.get(best)).padEnd(22)} J ${fmt(obj.J)}  |  ` +
        scored.map((x) => `${showValue(x.v)} → ${fmt(x.obj.J)}`).join('  ');
      if (top && top.obj.J < obj.J - MIN_GAIN) {
        moves.push(`${c.name}: ${showValue(c.get(best))} → ${showValue(top.v)} (J ${fmt(obj.J)} → ${fmt(top.obj.J)})${c.pinnedBy ? ` [pinned by ${c.pinnedBy}]` : ''}`);
        best = top.cand;
        obj = top.obj;
        moved = true;
        o.log(`${line}   ✓ ${showValue(top.v)}`);
      } else o.log(line);
    }
    o.log(`after pass ${pass} (${((performance.now() - t0) / 1000).toFixed(0)} s): ${show(obj)}`);
    if (!moved || performance.now() - t0 > o.budgetMs) break;
  }
  await pool.close();
  return { best, obj, start: first, moves };
}

/** The winning constants as they differ from the start, ready to paste into config.ts / relations.ts. */
function diff(start: Candidate, best: Candidate): string[] {
  const out: string[] = [];
  for (const k of Object.keys(best.cfg) as (keyof ModelConfig)[]) {
    if (key(best.cfg[k]) !== key(start.cfg[k])) out.push(`  cfg.${k}: ${key(start.cfg[k])} → ${key(best.cfg[k])}`);
  }
  for (const k of Object.keys(best.strengths) as (keyof TransferStrengths)[]) {
    if (key(best.strengths[k]) !== key(start.strengths[k])) out.push(`  TRANSFER_S.${String(k)}: ${key(start.strengths[k])} → ${key(best.strengths[k])}`);
  }
  return out;
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main(): Promise<void> {
  const log = (l: string) => console.log(l);
  const o: DescentOptions = {
    passes: Number(arg('passes', '2')),
    budgetMs: Number(arg('budget', '240')) * 1000,
    workers: Number(arg('workers', String(Math.max(1, Math.min(4, availableParallelism()))))),
    free: process.argv.includes('--free'),
    seeds: arg('seeds', CALIBRATION_SEEDS.join(',')).split(',').map(Number),
    log,
  };
  const start: Candidate = { cfg: DEFAULT_MODEL, strengths: { ...TRANSFER_S } };
  log(`Calibrating the v2 learner model: ${J_SCENARIOS.length} scenarios × ${o.seeds.length} seeds (${o.seeds.join(',')}), ` +
    `${o.workers} workers, ≤ ${o.passes} passes, budget ${o.budgetMs / 1000} s${o.free ? ', test-pinned constants swept too' : ''}`);
  const t = performance.now();
  const { best, obj, start: startObj, moves } = await descend(start, o);
  log(`\ndescent done in ${((performance.now() - t) / 1000).toFixed(0)} s`);
  log(`start:  ${show(startObj)}`);
  log(`winner: ${show(obj)}`);
  log(moves.length ? `moves:\n  ${moves.join('\n  ')}` : 'moves: none – DEFAULT_MODEL is a local optimum of the grid');
  const changed = diff(start, best);
  if (changed.length) log(`winning constants (differences from DEFAULT_MODEL / TRANSFER_S):\n${changed.join('\n')}`);

  log('\nmetric table, current DEFAULT_MODEL (seeds 1–5):');
  log(formatTable(runBaseline(v2Driver(DEFAULT_CONTEXT, { cfg: start.cfg, strengths: start.strengths })).rows));
  if (changed.length) {
    log('\nmetric table, winner (seeds 1–5):');
    log(formatTable(runBaseline(v2Driver(DEFAULT_CONTEXT, { cfg: best.cfg, strengths: best.strengths })).rows));
  }
}

if (!isMainThread) {
  parentPort!.on('message', (job: Job) => parentPort!.postMessage({ id: job.id, obj: objective(job.cand, job.seeds) }));
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
