import { TRIAD_TYPES, TriadType } from '../exercises/families/triadBuild';
import { VOICING_TYPES, VoicingType } from '../exercises/families/keysVoicing';
import { pcSkill } from '../exercises/common';
import { INTERVALS } from '../theory/interval';
import { PitchClass } from '../theory/pitch';

/*
 * Leaf skill ids, parsed and formatted. The strings are the ones the exercise families emit
 * ('note:F#/string:5', 'interval:b3/up/strings:5-4', 'triad:maj/inv:1/strings:4-3-2',
 * 'melody:minor/deg:3', 'keys:dim/inv:2', 'voicing:dom9'); string numbers are the guitarist's
 * (6 = low E … 1 = high E), exactly as written. Anything else – including the v1 ancestor keys
 * 'note', 'interval:b3', 'triad:maj/inv:0' – parses to null, never throws: ids come from
 * persisted data.
 */

export type ParsedSkill =
  | { family: 'note'; pc: PitchClass; string: number }
  | { family: 'interval'; degree: string; semitones: number; dir: 'up' | 'down'; from: number; to: number }
  | { family: 'triad'; type: TriadType; inv: number; strings: number[] }
  | { family: 'melody'; mode: 'major' | 'minor'; deg: number }
  | { family: 'keys'; type: TriadType; inv: number }
  | { family: 'voicing'; type: VoicingType };

// ── Lookup tables ──

/** Pitch-class names as skill ids spell them ('C#', never 'Db'), by pitch class. */
const PC_NAMES: readonly string[] = Array.from({ length: 12 }, (_, pc) => pcSkill(pc));
const PC_BY_NAME = new Map<string, PitchClass>(PC_NAMES.map((name, pc) => [name, pc]));

/** Interval degree tokens of the 12 simple intervals (b2 … 8), by semitones. */
const SEMITONES_BY_DEGREE = new Map<string, number>(
  INTERVALS.filter((i) => i.semitones >= 1 && i.semitones <= 12).map((i) => [i.degree, i.semitones]),
);

const isTriadType = (s: string): s is TriadType => (TRIAD_TYPES as readonly string[]).includes(s);
const isVoicingType = (s: string): s is VoicingType => (VOICING_TYPES as readonly string[]).includes(s);
const isInversion = (n: number): boolean => n === 0 || n === 1 || n === 2;

// ── Patterns ──

const NOTE = /^note:([A-G]#?)\/string:([1-9]\d*)$/;
const INTERVAL = /^interval:(b?\d+)\/(up|down)\/strings:([1-9]\d*)-([1-9]\d*)$/;
const TRIAD = /^triad:([a-z]+)\/inv:(\d)\/strings:([1-9]\d*)-([1-9]\d*)-([1-9]\d*)$/;
const MELODY = /^melody:(major|minor)\/deg:([1-7])$/;
const KEYS = /^keys:([a-z]+)\/inv:(\d)$/;
const VOICING = /^voicing:([a-z0-9]+)$/;

// ── Parse / format ──

/** Structured view of a leaf skill id; null for anything that is not one. */
export function parseSkillId(id: string): ParsedSkill | null {
  if (typeof id !== 'string') return null;
  let m: RegExpExecArray | null;
  if ((m = NOTE.exec(id))) {
    const pc = PC_BY_NAME.get(m[1]);
    return pc === undefined ? null : { family: 'note', pc, string: Number(m[2]) };
  }
  if ((m = INTERVAL.exec(id))) {
    const semitones = SEMITONES_BY_DEGREE.get(m[1]);
    const from = Number(m[3]), to = Number(m[4]);
    if (semitones === undefined || from === to) return null;
    return { family: 'interval', degree: m[1], semitones, dir: m[2] as 'up' | 'down', from, to };
  }
  if ((m = TRIAD.exec(id))) {
    const inv = Number(m[2]);
    const strings = [Number(m[3]), Number(m[4]), Number(m[5])];
    if (!isTriadType(m[1]) || !isInversion(inv) || new Set(strings).size !== 3) return null;
    return { family: 'triad', type: m[1], inv, strings };
  }
  if ((m = MELODY.exec(id))) return { family: 'melody', mode: m[1] as 'major' | 'minor', deg: Number(m[2]) };
  if ((m = KEYS.exec(id))) {
    const inv = Number(m[2]);
    return isTriadType(m[1]) && isInversion(inv) ? { family: 'keys', type: m[1], inv } : null;
  }
  if ((m = VOICING.exec(id))) return isVoicingType(m[1]) ? { family: 'voicing', type: m[1] } : null;
  return null;
}

/** Inverse of parseSkillId: formatSkillId(parseSkillId(id)) === id for every catalog id. */
export function formatSkillId(p: ParsedSkill): string {
  switch (p.family) {
    case 'note': return `note:${PC_NAMES[p.pc]}/string:${p.string}`;
    case 'interval': return `interval:${p.degree}/${p.dir}/strings:${p.from}-${p.to}`;
    case 'triad': return `triad:${p.type}/inv:${p.inv}/strings:${p.strings.join('-')}`;
    case 'melody': return `melody:${p.mode}/deg:${p.deg}`;
    case 'keys': return `keys:${p.type}/inv:${p.inv}`;
    case 'voicing': return `voicing:${p.type}`;
  }
}

/** True for the ids the families emit; false for v1 ancestor keys and garbage. */
export const isLeafId = (id: string): boolean => parseSkillId(id) !== null;
