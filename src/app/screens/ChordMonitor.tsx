import { useEffect, useState } from 'preact/hooks';
import {
  EMPTY_JAM, Key, KeyMode, MAJOR_TONICS, MINOR_TONICS, PadBank, autoKey, chord, chordFunction, chordTones, jamStep, melodyGuide,
  melodyNoteRole, melodyNotes, nextChords, notePc, padFor, parseNote, pcToNote, toPc,
} from '../../core';
import { DotKind, Piano, PianoMarks } from '../components/Piano';
import { keyName, showChord, showNote } from '../lib/names';
import { useMidi } from '../lib/midi';
import { Settings } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  /** What is on the FLkey pads, so the screen can say "Pad 3" next to the chord. */
  pads: PadBank;
  onExit: () => void;
}

const PIANO_LOW = 48;
const PIANO_HIGH = 84;

/**
 * Jam screen: the chord held on the keyboard (FLkey pads in User Chord Mode don't show theirs),
 * what it does in the key, which melody tones sit on it, and where it tends to go next.
 */
export function ChordMonitor({ settings, onSettings, pads, onExit }: Props) {
  useWakeLock();
  const [jam, setJam] = useState(EMPTY_JAM);
  const [auto, setAuto] = useState<Key | null>(null);
  const [picking, setPicking] = useState(false);
  const midi = useMidi((settled) => setJam((j) => jamStep(j, settled)), 3);
  useEffect(() => setAuto((k) => autoKey(jam.history, k)), [jam.history]);

  const style = settings.noteNames;
  const locked: Key | null = settings.jamKey ? { tonic: parseNote(settings.jamKey.tonic), mode: settings.jamKey.mode } : null;
  const key = locked ?? auto;
  const setKey = (k: { tonic: string; mode: KeyMode } | null) => onSettings({ ...settings, jamKey: k });

  const c = jam.chord;
  const fn = c && key ? chordFunction(key, c) : null;
  const root = c ? (fn ? fn.root : pcToNote(c.rootPc, 'flat')) : null;
  const named = c && root ? chord(root, c.typeId) : null;
  const bassPc = jam.chordMidis.length ? toPc(Math.min(...jam.chordMidis)) : null;
  const slash = named && bassPc !== null && bassPc !== notePc(named.root) ? ` / ${showNote(pcToNote(bassPc, 'flat'), style)}` : '';
  const symbol = named ? showChord(named, style) + slash : null;
  const tones = named ? chordTones(named).map((n, i) => `${showNote(n, style)} (${named.type.formula[i] ? degreeLabel(named.type.formula[i]) : ''})`) : [];

  const guide = c ? melodyGuide(key, c) : null;
  const melody = melodyNotes(jam, midi.held);
  const dots: PianoMarks['dots'] = {};
  if (guide) {
    for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
      const pc = toPc(m);
      const tone = guide.tones.find((t) => t.pc === pc);
      const kind: DotKind | null = tone ? tone.weight : guide.avoid.includes(pc) ? 'avoid' : guide.scalePcs.includes(pc) ? 'safe' : null;
      if (kind) dots[m] = { kind, label: tone?.degree ?? (kind === 'avoid' ? '11' : undefined) };
    }
  }
  const melodyRole = c && melody.length ? melodyNoteRole(key, c, toPc(melody[melody.length - 1])) : null;
  const melodyName = melody.length ? showNote(pcToNote(toPc(melody[melody.length - 1]), 'flat'), style) : '';
  const targets = guide ? guide.tones.filter((t) => t.weight === 'target') : [];
  const colours = guide ? guide.tones.filter((t) => t.weight === 'colour') : [];
  const noteOf = (pc: number) => showNote(pcToNote(pc, 'flat'), style);
  const next = c && key ? nextChords(key, c) : [];
  const padNo = c ? padFor(pads, jam.chordMidis) : null;
  const tonics = (mode: KeyMode) => (mode === 'major' ? MAJOR_TONICS : MINOR_TONICS);
  const pickMode: KeyMode = locked?.mode ?? auto?.mode ?? 'major';

  return (
    <main class="screen monitor">
      <header class="bar">
        <span class="drill-name">Was spiele ich?</span>
        <div class="row">
          <button class={locked ? 'pill on' : 'pill'} onClick={() => setPicking(!picking)} aria-expanded={picking} data-testid="key-chip">
            {key ? `Tonart: ${keyName(key.tonic, key.mode, style)}${locked ? '' : ' (auto)'}` : 'Tonart: auto'}
          </button>
          <button class="quiet" onClick={onExit}>Fertig</button>
        </div>
      </header>

      {picking && (
        <section class="key-pick" aria-label="Tonart wählen">
          <button class={locked ? 'pill' : 'pill on'} onClick={() => setKey(null)}>Auto</button>
          <span class="pill sep">·</span>
          {(['major', 'naturalMinor'] as KeyMode[]).map((mode) => (
            <button class={pickMode === mode ? 'pill on' : 'pill'}
              onClick={() => setKey({ tonic: locked ? tonics(mode)[tonics(locked.mode).findIndex((t) => notePc(parseNote(t)) === notePc(locked.tonic))] : tonics(mode)[0], mode })}>
              {mode === 'major' ? 'major' : 'minor'}
            </button>
          ))}
          <span class="pill sep">·</span>
          {tonics(pickMode).map((t) => (
            <button class={locked && notePc(locked.tonic) === notePc(parseNote(t)) ? 'pill on' : 'pill'} onClick={() => setKey({ tonic: t, mode: pickMode })}>
              {showNote(parseNote(t), style)}
            </button>
          ))}
        </section>
      )}

      <section class="focus">
        <div class="target" data-testid="chord-name">{symbol ?? (midi.held.length ? '–' : ' ')}</div>
        <div class="context" data-testid="chord-function">
          {fn && key ? <><b>{fn.roman}</b> in {keyName(key.tonic, key.mode, style)} · {fn.role}</> : c ? 'Tonart wird erkannt …' : midi.devices.length ? 'Pad oder Akkord drücken' : 'Kein Keyboard – am FLkey anschließen oder koppeln'}
        </div>
        <p class="meta" data-testid="chord-notes">{padNo !== null ? `Pad ${padNo + 1}  ·  ` : ''}{tones.join('  ·  ')}</p>

        <Piano marks={{ held: jam.chordMidis.filter((m) => midi.held.includes(m)), right: melody, dots }} noteNames={style} />

        <div class={`hint ${melodyRole ? (melodyRole.kind === 'target' || melodyRole.kind === 'colour' ? 'ok' : melodyRole.kind === 'avoid' || melodyRole.kind === 'outside' ? 'off' : '') : ''}`} data-testid="melody-line">
          {melodyRole ? `${melodyName} = ${melodyRole.degree} über ${symbol}: ${melodyRole.text}`
            : guide ? `Melodie: Zieltöne ${targets.map((t) => `${noteOf(t.pc)} (${t.degree})`).join(', ')}${colours.length ? ` · Farbe ${colours.map((t) => `${noteOf(t.pc)} (${t.degree})`).join(', ')}` : ''}${guide.avoid.length ? ` · nicht liegen lassen: ${guide.avoid.map(noteOf).join(', ')}` : ''}`
            : midi.devices.length ? '' : ''}
        </div>

        {next.length > 0 && (
          <div class="next" data-testid="next-chords">
            <span class="next-label">Danach passt</span>
            <div class="chips">
              {next.map((s) => (
                <div class="chip">
                  <span class="chip-name">{showChord(chord(s.root, s.typeId), style)}</span>
                  <span class="chip-roman">{s.roman}</span>
                  <span class="chip-why">{s.why}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {midi.devices.length > 0 && !c && <p class="meta">🎹 {midi.devices.join(', ')}</p>}
      </section>
    </main>
  );
}

const degreeLabel = (d: { number: number; acc: number }): string => (d.acc > 0 ? '#'.repeat(d.acc) : 'b'.repeat(-d.acc)) + d.number;
