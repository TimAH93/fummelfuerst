import {
  AnswerMode,
  AutoResponse,
  DEFAULT_CONTEXT,
  Exercise,
  ExerciseContext,
  HelpLevel,
  KeysChordParams,
  KeysChordSolution,
  KeysVoicingParams,
  KeysVoicingSolution,
  MelodyChordParams,
  MelodyChordSolution,
  Response,
  Rng,
  SelfRating,
  TRIAD_TYPES,
  getFamily,
  isEssential,
  solve,
} from '../../src/core/exercises';
import { crossesIrregularPair, positionsOf } from '../../src/core/guitar/fretboard';
import { identifyHeld } from '../../src/core/keys/heldChord';
import { suggestVoicing } from '../../src/core/keys/pads';
import { ProgChord } from '../../src/core/song/analysis';
import { chord, chordPcs, chordType } from '../../src/core/theory/chord';
import { degreeSemitones, parseDegree } from '../../src/core/theory/interval';
import { toPc } from '../../src/core/theory/pitch';
import { notePc, parseNote } from '../../src/core/theory/spelling';
import { FAMILY_GUESS, HARD_DIFFICULTY, OPTIMIST_SHARE, Persona } from './persona';

/**
 * The hidden learner behind the simulation (spec §9.1): true knowledge and memory stability
 * per skill, a power-law forgetting curve, help-dependent answer probabilities, hidden
 * transfer between neighbouring skills, and answer generation – self-ratings for play
 * families, `solve()` or a confusable wrong answer for tap families, so `diagnose()` and the
 * boosts are exercised. Deliberately *not* the learner model's functional form: the model
 * uses an exponential half-life, the world a power law; the model a Beta belief, the world a
 * scalar k. All randomness comes from the supplied Rng in a stable call order.
 */

const MIN = 60_000;
/** Stability of a skill after its first exposure, and the floor after a miss. */
export const S0 = 20 * MIN;
/** Spread of the latency noise. */
const LATENCY_SD = 400;
/** A wrong self-rated answer is "≈ Fast" this often when the family knows confusables. */
const NEAR_SHARE = 0.4;
/** Seconds between jam chords. */
const JAM_GAP = 2_000;

/** Families answered on screen and checked automatically; the rest are played and self-rated (Practice.tsx). */
export const TAP_FAMILIES = ['melody-chord', 'keys-chord', 'keys-voicing'];
export const modeFor = (family: string): AnswerMode => (TAP_FAMILIES.includes(family) ? 'tap' : 'play');

export interface TrueSkill {
  /** True knowledge 0..1. */
  k: number;
  /** Memory stability in ms: recall after Δt is (1 + Δt/S)^(−0.5). */
  S: number;
  /** Epoch ms of the last correct answer (0 = never); recall is measured from here. */
  lastOk: number;
}

/** One hidden-state change, kept per skill so metrics can evaluate true recall at any past time. */
export interface WorldEvent extends TrueSkill {
  at: number;
}

export interface SimAnswer {
  response: Response;
  latencyMs: number;
  /** The drawn outcome; the attempt's own evaluation is authoritative for learning. */
  correct: boolean;
  /** True knowledge and recall at the moment of the question. */
  k: number;
  R: number;
}

/** A jam chord between sessions, in the raw form the v2 driver turns into a PlayEvent (`jamEvent`). */
export interface SimPlay {
  midis: number[];
  at: number;
  picked: boolean;
  /** The chord equals one of the stored pads (pad memory, not the skill). */
  pad: boolean;
  /** Catalog skill the chord demonstrates, if any (what the hidden learner credits). */
  skill?: string;
}

// ── Skill ids, as far as the world needs them ──

type SimSkill =
  | { family: 'note'; pc: number; accidental: boolean; string: number }
  | { family: 'interval'; degree: string; semitones: number; dir: 'up' | 'down'; from: number; to: number }
  | { family: 'triad'; type: string; inv: number; strings: number[] }
  | { family: 'melody'; mode: 'major' | 'minor'; deg: number }
  | { family: 'keys'; type: string; inv: number }
  | { family: 'voicing'; type: string };

/** A local, forgiving parse of the catalog's skill-id strings (guitarist string numbers 6..1). */
export function parseSimSkill(id: string): SimSkill | null {
  let m: RegExpExecArray | null;
  if ((m = /^note:([A-G]#?)\/string:(\d)$/.exec(id))) return { family: 'note', pc: notePc(parseNote(m[1])), accidental: m[1].includes('#'), string: Number(m[2]) };
  if ((m = /^interval:([^/]+)\/(up|down)\/strings:(\d)-(\d)$/.exec(id)))
    return { family: 'interval', degree: m[1], semitones: degreeSemitones(parseDegree(m[1])), dir: m[2] as 'up' | 'down', from: Number(m[3]), to: Number(m[4]) };
  if ((m = /^triad:(\w+)\/inv:(\d)\/strings:(\d)-(\d)-(\d)$/.exec(id))) return { family: 'triad', type: m[1], inv: Number(m[2]), strings: [Number(m[3]), Number(m[4]), Number(m[5])] };
  if ((m = /^melody:(major|minor)\/deg:(\d)$/.exec(id))) return { family: 'melody', mode: m[1] as 'major' | 'minor', deg: Number(m[2]) };
  if ((m = /^keys:(\w+)\/inv:(\d)$/.exec(id))) return { family: 'keys', type: m[1], inv: Number(m[2]) };
  if ((m = /^voicing:(\w+)$/.exec(id))) return { family: 'voicing', type: m[1] };
  return null;
}

/** Interval skills whose two strings sit on opposite sides of the G/B pair. */
export const crossesGB = (id: string): boolean => {
  const p = parseSimSkill(id);
  return p?.family === 'interval' && Math.min(p.from, p.to) <= 2 && Math.max(p.from, p.to) >= 3;
};

/** Guitarist string number → internal index. */
const idx = (ctx: ExerciseContext, n: number): number => ctx.tuning.strings.length - n;

/**
 * Ordering difficulty 0..1, the world's own copy of the spec §4.4 formulas: decides which
 * skills take the persona's `hard` multiplier.
 */
export function simDifficulty(id: string, ctx: ExerciseContext = DEFAULT_CONTEXT): number {
  const p = parseSimSkill(id);
  if (!p) return 0;
  const t = ctx.tuning;
  switch (p.family) {
    case 'note': {
      const s = idx(ctx, p.string);
      const frets = positionsOf(t, p.pc, { ...ctx.range, strings: [s] }).map((x) => x.fret);
      return 0.6 * (Math.min(...frets) / 12) + 0.4 * (p.accidental ? 1 : 0);
    }
    case 'interval': {
      const from = idx(ctx, p.from), to = idx(ctx, p.to);
      const offset = (p.dir === 'up' ? p.semitones : -p.semitones) - (t.strings[to] - t.strings[from]);
      return 0.3 * (crossesIrregularPair(t, from, to) ? 1 : 0) + 0.3 * (Math.abs(p.from - p.to) - 1) + 0.2 * (p.dir === 'down' ? 1 : 0) + 0.2 * Math.min(1, Math.abs(offset) / 4);
    }
    case 'triad': {
      const [lo, , hi] = p.strings;
      return 0.25 * (p.inv / 2) + 0.3 * (p.type === 'dim' || p.type === 'aug' ? 1 : 0) + 0.25 * (crossesIrregularPair(t, idx(ctx, lo), idx(ctx, hi)) ? 1 : 0) + 0.2 * (lo === 6 ? 1 : 0);
    }
    case 'keys':
      return 0.3 * (p.inv / 2) + 0.4 * (p.type === 'dim' || p.type === 'aug' ? 1 : 0);
    case 'voicing': {
      const f = chordType(p.type).formula;
      const altered = f.some((d) => (d.number === 5 || d.number === 9) && d.acc !== 0);
      return 0.15 * (f.length - 4) + 0.3 * (altered ? 1 : 0) + 0.2 * (f.some((d) => d.number === 13) ? 1 : 0);
    }
    case 'melody':
      return ([1, 3, 5].includes(p.deg) ? 0.2 : p.deg === 7 ? 0.7 : 0.5) + (p.mode === 'minor' ? 0.1 : 0);
  }
}

/**
 * The world's own neighbour list for hidden transfer: same pitch class on any other string,
 * the mirror interval, keys ↔ guitar triad of the same type and inversion. Overlaps with but
 * is not identical to relations.ts.
 */
export function trueNeighbours(id: string, catalog: ReadonlySet<string>): string[] {
  const p = parseSimSkill(id);
  if (!p) return [];
  const out: string[] = [];
  const push = (s: string) => { if (catalog.has(s)) out.push(s); };
  if (p.family === 'note') {
    const name = id.slice(0, id.indexOf('/'));
    for (let n = 1; n <= 6; n++) if (n !== p.string) push(`${name}/string:${n}`);
  } else if (p.family === 'interval') {
    push(`interval:${p.degree}/${p.dir === 'up' ? 'down' : 'up'}/strings:${p.to}-${p.from}`);
  } else if (p.family === 'keys') {
    for (const s of catalog) if (s.startsWith(`triad:${p.type}/inv:${p.inv}/`)) out.push(s);
  } else if (p.family === 'triad') {
    push(`keys:${p.type}/inv:${p.inv}`);
  }
  return out;
}

// ── The world ──

export class World {
  readonly skills: Record<string, TrueSkill> = {};
  /** Every hidden-state change per skill, oldest first (metrics read true recall from it). */
  readonly history: Record<string, WorldEvent[]> = {};
  private readonly catalog: ReadonlySet<string>;

  constructor(readonly persona: Persona, catalogIds: readonly string[], readonly rng: Rng, readonly ctx: ExerciseContext = DEFAULT_CONTEXT) {
    this.catalog = new Set(catalogIds);
  }

  /** True state of a skill; a cold skill is initialised from k0 and hidden transfer on first touch. */
  skill(id: string): TrueSkill {
    return (this.skills[id] ??= this.initial(id));
  }

  /** The state a skill has or would start with, without touching it. */
  peek(id: string): TrueSkill {
    return this.skills[id] ?? this.initial(id);
  }

  /** The skill has been exposed (answered or jammed) at least once. */
  seen(id: string): boolean {
    return this.skills[id] !== undefined;
  }

  private initial(id: string): TrueSkill {
    const { persona } = this;
    let k = persona.k0 + (persona.gbWeak && crossesGB(id) ? persona.gbWeak.k0 : 0);
    if (persona.transfer > 0) for (const n of trueNeighbours(id, this.catalog)) {
      const t = this.skills[n];
      if (t) k = Math.max(k, persona.transfer * t.k);
    }
    return { k: Math.max(0, Math.min(1, k)), S: S0, lastOk: 0 };
  }

  /** True recall 0..1: a power law from the last correct answer, 1 for knowledge never yet recalled. */
  recall(id: string, now: number): number {
    const t = this.skills[id];
    return t?.lastOk ? recallOf(t, now) : 1;
  }

  /** P(correct) before and after the help bonus of the level the question was shown at. */
  pCorrect(id: string, family: string, now: number, help: HelpLevel): number {
    const t = this.skill(id);
    const guess = this.persona.guess * ((FAMILY_GUESS[family] ?? 1 / 12) / (1 / 12));
    const p = guess + (1 - guess) * t.k * this.recall(id, now);
    return 1 - (1 - p) * (1 - (this.persona.helpBonus[help] ?? 0));
  }

  /** Answer an exercise: the outcome is drawn, then a matching response and latency are produced. */
  answer(ex: Exercise, help: HelpLevel, now: number): SimAnswer {
    const id = ex.skills[0];
    const family = getFamily(ex.family);
    const t = this.skill(id);
    const R = this.recall(id, now);
    const correct = this.rng.next() < this.pCorrect(id, ex.family, now, help);
    const response: Response = modeFor(ex.family) === 'tap'
      ? correct ? solve(ex) : this.confusable(ex)
      : { kind: 'self', rating: this.rating(correct, t.k * R, family.nearNeighbours !== undefined) };
    const { fastMs, slowMs } = family.tempo;
    const latencyMs = Math.max(200, Math.round(fastMs + (slowMs - fastMs) * (1 - t.k * R) + LATENCY_SD * this.normal()));
    return { response, latencyMs, correct, k: t.k, R };
  }

  /**
   * Learn from an answer (or a jam chord): a correct answer moves k by learn·hard·(1 − k), the
   * reveal after a miss by half of that, ×0.7 when everything was on screen; a spaced recall
   * multiplies stability, a massed one barely, a miss cuts it to 40 % (never below S0).
   */
  observe(id: string, correct: boolean, help: HelpLevel, now: number, play = false): void {
    const t = this.skill(id);
    const { persona } = this;
    const weak = persona.gbWeak && crossesGB(id) ? persona.gbWeak.learn : 1;
    const hard = simDifficulty(id, this.ctx) >= HARD_DIFFICULTY ? persona.hard : 1;
    const rate = persona.learn * weak * hard * (correct ? 1 : 0.5) * (help === 0 ? 0.7 : 1) * (play ? 0.5 : 1);
    t.k = Math.min(1, t.k + rate * (1 - t.k));
    if (correct) {
      const dt = t.lastOk ? now - t.lastOk : 0;
      t.S = t.lastOk && dt >= 0.1 * t.S ? Math.max(t.S * persona.sGrowth, 0.6 * dt) : t.S * 1.02;
      t.lastOk = now;
    } else t.S = Math.max(S0, 0.4 * t.S);
    (this.history[id] ??= []).push({ at: now, ...t });
  }

  /** A day of noodling on the keys: pad hits teach nothing, chords built by hand teach their keys skill. */
  jam(now: number): SimPlay[] {
    const play = this.persona.play;
    if (!play) return [];
    const out: SimPlay[] = [];
    for (let i = 0; i < play.perDay; i++) {
      const at = now + i * JAM_GAP;
      const c = this.rng.pick(play.chords);
      if (this.rng.bool(play.padShare)) {
        out.push({ midis: suggestVoicing(c), at, picked: false, pad: true });
        continue;
      }
      const inv = this.rng.int(0, 2);
      const midis = closeVoicing(c, inv);
      const held = identifyHeld(midis);
      const skill = held && (TRIAD_TYPES as readonly string[]).includes(held.type.id) ? `keys:${held.type.id}/inv:${held.inversion}` : undefined;
      if (skill && this.catalog.has(skill)) this.observe(skill, true, 3, at, true);
      out.push({ midis, at, picked: false, pad: false, skill });
    }
    return out;
  }

  // ── Answer details ──

  private rating(correct: boolean, kR: number, hasNear: boolean): SelfRating {
    if (!correct) {
      // Always drawn, so the random stream (and baseline-v1.json) does not move when a family gains nearNeighbours.
      const near = this.rng.bool(NEAR_SHARE);
      return hasNear && near ? 'near' : 'miss';
    }
    if (this.persona.foundOnly) return 'found';
    if (kR >= this.persona.instantAt) return 'instant';
    return this.persona.optimist && this.rng.bool(OPTIMIST_SHARE) ? 'instant' : 'found';
  }

  /** A plausible wrong answer per tap family, so the families' diagnoses get exercised. */
  private confusable(ex: Exercise): AutoResponse {
    const r = this.rng.next();
    switch (ex.family) {
      case 'keys-chord': return wrongKeysChord(ex as Exercise<KeysChordParams, KeysChordSolution>, r, this.rng);
      case 'melody-chord': return wrongMelodyChord(ex as Exercise<MelodyChordParams, MelodyChordSolution>, r, this.rng);
      case 'keys-voicing': return wrongKeysVoicing(ex as Exercise<KeysVoicingParams, KeysVoicingSolution>, r);
      default: throw new Error(`No confusable answers for ${ex.family}`);
    }
  }

  /** Standard normal by Box–Muller from the seeded rng (two draws, one used). */
  private normal(): number {
    const u = 1 - this.rng.next();
    const v = this.rng.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

/** Power-law recall of a true skill at `now`. */
export const recallOf = (t: TrueSkill, now: number): number => (t.lastOk ? (1 + Math.max(0, now - t.lastOk) / t.S) ** -0.5 : 1);

/** Close voicing of a triad in the given inversion, stacked upward from middle C. */
export function closeVoicing(c: ProgChord, inv: number): number[] {
  const pcs = chordType(c.typeId).formula.map((d) => toPc(c.rootPc + degreeSemitones(d)));
  const out: number[] = [];
  for (let k = 0; k < pcs.length; k++) {
    const pc = pcs[(inv + k) % pcs.length];
    let m = out.length ? out[out.length - 1] + 1 : 60;
    while (toPc(m) !== pc) m++;
    out.push(m);
  }
  return out;
}

// ── Confusable wrong answers per family (keys-chord 50/30/20, melody-chord 60/40, keys-voicing 50/25/25) ──

function wrongKeysChord(ex: Exercise<KeysChordParams, KeysChordSolution>, r: number, rng: Rng): AutoResponse {
  const notes = ex.solution.notes;
  if (r < 0.5) return { kind: 'notes', midis: [...notes.slice(1), notes[0] + 12] };               // the next inversion
  if (r < 0.8) {                                                                                   // another triad type on the same root
    const pcs = chordPcs(chord(ex.params.root, ex.params.typeId));
    const shift: Record<string, [number, number]> = { maj: [1, -1], min: [1, 1], dim: [2, 1], aug: [2, -1] };
    const [tone, by] = shift[ex.params.typeId];
    return { kind: 'notes', midis: notes.map((m) => (toPc(m) === pcs[tone] ? m + by : m)) };
  }
  const drop = rng.int(1, notes.length - 1);                                                       // one tone missing (never the bass)
  return { kind: 'notes', midis: notes.filter((_, i) => i !== drop) };
}

function wrongMelodyChord(ex: Exercise<MelodyChordParams, MelodyChordSolution>, r: number, rng: Rng): AutoResponse {
  const right = ex.solution.chords.map((c) => c.id);
  const extra = ex.params.choices.map((c) => c.id).filter((id) => !right.includes(id));
  if (r < 0.6 || extra.length === 0) {                                                             // one chip missing
    const drop = rng.int(0, right.length - 1);
    return { kind: 'choices', ids: right.filter((_, i) => i !== drop) };
  }
  return { kind: 'choices', ids: [...right, rng.pick(extra)] };                                    // one chip too many
}

function wrongKeysVoicing(ex: Exercise<KeysVoicingParams, KeysVoicingSolution>, r: number): AutoResponse {
  const notes = ex.solution.notes;
  const c = chord(ex.params.root, ex.params.typeId);
  const pcs = chordPcs(c);
  if (r < 0.5) {                                                                                   // the colour (top essential tone) missing
    const essentials = c.type.formula.map((d, i) => (isEssential(d) ? pcs[i] : -1)).filter((p) => p >= 0);
    const top = essentials[essentials.length - 1];
    const at = notes.findIndex((m, i) => i > 0 && toPc(m) === top);
    return { kind: 'notes', midis: notes.filter((_, i) => i !== at) };
  }
  if (r < 0.75) return { kind: 'notes', midis: [notes[0] - 5, ...notes.slice(1)] };              // the fifth in the bass
  let m = notes[notes.length - 1] + 1;                                                             // a foreign tone on top
  while (pcs.includes(toPc(m))) m++;
  return { kind: 'notes', midis: [...notes, m] };
}
