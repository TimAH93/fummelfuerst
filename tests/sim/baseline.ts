import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TrackId } from '../../src/core/curriculum/curriculum';
import { Driver, v1Driver } from './drivers';
import { SimReport } from './metrics';
import { PERSONAS, Persona } from './persona';
import { runSim } from './run';

/**
 * `npm run baseline`: the v1 learner model's numbers for every persona of spec §9.1 – the
 * "before" column of the README's calibration table. Prints a table and writes every report
 * to tests/sim/baseline-v1.json (deterministic: same seeds, same output). Found-only never
 * passes under v1, and v1 never decays, so its recall calibration is the worst case.
 */

export const SEEDS = [1, 2, 3, 4, 5];

/** Which track and horizon each persona is measured on. */
export const SCENARIOS: readonly { persona: string; track: TrackId; days: number }[] = [
  { persona: 'quick', track: 'fretboard', days: 28 },
  { persona: 'steady', track: 'fretboard', days: 28 },
  { persona: 'steady', track: 'intervals', days: 28 },
  { persona: 'slow', track: 'fretboard', days: 28 },
  { persona: 'stuck', track: 'intervals', days: 56 },
  { persona: 'foundOnly', track: 'fretboard', days: 42 },
  { persona: 'optimist', track: 'fretboard', days: 28 },
  { persona: 'forgetful', track: 'fretboard', days: 28 },
  { persona: 'returning', track: 'fretboard', days: 42 },
  { persona: 'gbWeak', track: 'intervals', days: 56 },
  { persona: 'noodler', track: 'keys', days: 28 },
];

export interface BaselineRow {
  persona: string;
  track: string;
  days: number;
  /** Medians over seeds. */
  answers: number;
  sessions: number;
  passed: number;
  /** First drill of the track: seeds that passed it, median answers and sessions among them. */
  firstDrill: { id: string; passedIn: number; answers: number | null; sessions: number | null };
  /** Pooled over seeds. */
  falsePassRate: number | null;
  /** Means over seeds with data. */
  retention7: number | null;
  retention21: number | null;
  overScheduled: number;
  underScheduled: number | null;
  weakShare: number | null;
  calibrationK: number | null;
  calibrationR: number | null;
  helpFinal: number | null;
  reviewShare: number;
  returnSlips: number | null;
  warmupPicks: number | null;
  meanTrueK: number;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const mean = (xs: (number | null)[]): number | null => {
  const ys = xs.filter((x): x is number => x !== null);
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
};
const lastHelp = (r: SimReport): number | null => [...r.helpByDay].reverse().find((h): h is number => h !== null) ?? null;

export function summarize(persona: Persona, track: TrackId, days: number, runs: SimReport[], firstDrillId: string): BaselineRow {
  const firsts = runs.map((r) => r.timeToPass[firstDrillId]).filter((t) => t !== undefined);
  const passedTotal = runs.reduce((a, r) => a + r.passed.length, 0);
  return {
    persona: persona.id,
    track,
    days,
    answers: median(runs.map((r) => r.answers)),
    sessions: median(runs.map((r) => r.sessions)),
    passed: median(runs.map((r) => r.passed.length)),
    firstDrill: {
      id: firstDrillId,
      passedIn: firsts.length,
      answers: firsts.length ? median(firsts.map((t) => t.answers)) : null,
      sessions: firsts.length ? median(firsts.map((t) => t.sessions)) : null,
    },
    falsePassRate: passedTotal ? runs.reduce((a, r) => a + r.falsePasses.length, 0) / passedTotal : null,
    retention7: mean(runs.map((r) => r.retention7)),
    retention21: mean(runs.map((r) => r.retention21)),
    overScheduled: mean(runs.map((r) => r.overScheduled)) ?? 0,
    underScheduled: mean(runs.map((r) => r.underScheduled)),
    weakShare: mean(runs.map((r) => r.weakShare)),
    calibrationK: mean(runs.map((r) => r.calibration?.knowledge ?? null)),
    calibrationR: mean(runs.map((r) => r.calibration?.recall ?? null)),
    helpFinal: mean(runs.map(lastHelp)),
    reviewShare: mean(runs.map((r) => r.reviewShare)) ?? 0,
    returnSlips: mean(runs.map((r) => r.returnSlips)),
    warmupPicks: mean(runs.map((r) => r.warmupPicks)),
    meanTrueK: mean(runs.map((r) => r.trueSkills.meanK)) ?? 0,
  };
}

/** Run every scenario on a driver; returns the rows and every report. */
export function runBaseline(driver: Driver, log: (line: string) => void = () => {}): { rows: BaselineRow[]; runs: SimReport[] } {
  const rows: BaselineRow[] = [];
  const runs: SimReport[] = [];
  for (const sc of SCENARIOS) {
    const persona = PERSONAS.find((p) => p.id === sc.persona)!;
    const firstDrill = driver.curriculum.find((d) => d.track === sc.track)!;
    const t = performance.now();
    const reports = SEEDS.map((seed) => runSim(persona, sc.track, sc.days, seed, driver));
    runs.push(...reports);
    rows.push(summarize(persona, sc.track, sc.days, reports, firstDrill.id));
    log(`  ${sc.persona}/${sc.track}: ${SEEDS.length} seeds in ${(performance.now() - t).toFixed(0)} ms`);
  }
  return { rows, runs };
}

const fmt = (x: number | null, digits = 2): string => (x === null ? '–' : x.toFixed(digits));

export function formatTable(rows: BaselineRow[]): string {
  const head = ['persona', 'track', 'days', 'ans', 'sess', 'pass', 'ttp1 (n/ans/sess)', 'fpr', 'ret7', 'ret21', 'over', 'under', 'weak', 'cal k', 'cal R', 'help', 'rev', 'slips', 'warm', 'true k'];
  const lines = rows.map((r) => [
    r.persona, r.track, String(r.days), fmt(r.answers, 0), fmt(r.sessions, 0), fmt(r.passed, 0),
    `${r.firstDrill.passedIn}/${SEEDS.length} ${fmt(r.firstDrill.answers, 0)} ${fmt(r.firstDrill.sessions, 0)}`,
    fmt(r.falsePassRate), fmt(r.retention7), fmt(r.retention21), fmt(r.overScheduled), fmt(r.underScheduled), fmt(r.weakShare),
    fmt(r.calibrationK), fmt(r.calibrationR), fmt(r.helpFinal, 1), fmt(r.reviewShare), fmt(r.returnSlips, 1), fmt(r.warmupPicks, 1), fmt(r.meanTrueK),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const row = (cells: string[]) => cells.map((c, i) => (i < 2 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  return [row(head), widths.map((w) => '─'.repeat(w)).join('  '), ...lines.map(row)].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const driver = v1Driver();
  console.log(`Learner model ${driver.name} baseline – ${SCENARIOS.length} scenarios × ${SEEDS.length} seeds`);
  const { rows, runs } = runBaseline(driver, (l) => console.log(l));
  console.log('\n' + formatTable(rows));
  const out = join(dirname(fileURLToPath(import.meta.url)), 'baseline-v1.json');
  writeFileSync(out, JSON.stringify({ driver: driver.name, seeds: SEEDS, scenarios: SCENARIOS, rows, runs }, null, 1) + '\n');
  console.log(`\nwrote ${out}`);
}
