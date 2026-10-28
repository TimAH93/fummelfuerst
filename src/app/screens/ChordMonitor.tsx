import { useEffect, useState } from 'preact/hooks';
import {
  EMPTY_JAM, INVERSION_NAMES, Key, KeyMode, MAJOR_TONICS, MINOR_TONICS, PadBank, autoKey, chord, chordFunction, chordTones, degreeSemitones,
  degreeToString, identifyHeld, jamStep, melodyGuide, melodyNoteRole, melodyNotes, nextChords, notePc, padFor, parseNote, pcToNote, spellInKey,
  keyScale, toPc,
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
const OVER_ROOT = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

/**
 * "Was spiele ich?" – by default just that, in real time: the chord the held keys make right now
 * and each tone's role. "Mehr" adds the key, the chord's function, the melody guide and what
 * tends to come next; those lean on a sticky chord that survives the pad being released.
 */
export function ChordMonitor({ settings, onSettings, pads, onExit }: Props) {
  useWakeLock();
  const [jam, setJam] = useState(EMPTY_JAM);
  const [auto, setAuto] = useState<Key | null>(null);
  const [picking, setPicking] = useState(false);
  const midi = useMidi((settled) => setJam((j) => jamStep(j, settled)), 3);
  useEffect(() => setAuto((k) => autoKey(jam.history, k)), [jam.history]);

  const style = settings.noteNames;
  const details = settings.jamDetails ?? false;
  const locked: Key | null = settings.jamKey ? { tonic: parseNote(settings.jamKey.tonic), mode: settings.jamKey.mode } : null;
  const key = locked ?? auto;
  const setKey = (k: { tonic: string; mode: KeyMode } | null) => onSettings({ ...settings, jamKey: k });
  const noteOf = (pc: number) => showNote(key ? spellInKey(keyScale(key), pc).note : pcToNote(pc, 'flat'), style);

  // Live: whatever is down right now.
  const live = identifyHeld(midi.held);
  const liveNamed = live ? chord(key ? spellInKey(keyScale(key), live.rootPc).note : pcToNote(live.rootPc, 'flat'), live.type.id) : null;
  const heldSorted = [...midi.held].sort((a, b) => a - b);
  const roleIn = (pc: number): string => {
    if (!live) return '';
    const d = live.type.formula.find((f) => toPc(live.rootPc + degreeSemitones(f)) === pc);
    return d ? degreeToString(d) : OVER_ROOT[toPc(pc - live.rootPc)];
  };
  const heldLine = heldSorted.map((m) => (live ? `${noteOf(toPc(m))} (${roleIn(toPc(m))})` : noteOf(toPc(m)))).join('  ·  ');
  const padNo = padFor(pads, midi.held);

  // Sticky: the chord the details lean on (stays while melody keys are added or the pad is released).
  const c = jam.chord;
  const fn = c && key ? chordFunction(key, c) : null;
  const stickyNamed = c ? chord(fn ? fn.root : pcToNote(c.rootPc, 'flat'), c.typeId) : null;
  const big = liveNamed ? showChord(liveNamed, style) : details && stickyNamed ? showChord(stickyNamed, style) : heldSorted.length ? heldSorted.map((m) => noteOf(toPc(m))).join(' ') : ' ';
  const inversionLine = live && live.inversion > 0 ? `tiefster Ton ${noteOf(live.bassPc)} · ${INVERSION_NAMES[live.inversion] ?? `${live.inversion}. inversion`}` : '';

  const guide = details && c ? melodyGuide(key, c) : null;
  const melody = details ? melodyNotes(jam, midi.held) : [];
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
  const melodyName = melody.length ? noteOf(toPc(melody[melody.length - 1])) : '';
  const targets = guide ? guide.tones.filter((t) => t.weight === 'target') : [];
  const colours = guide ? guide.tones.filter((t) => t.weight === 'colour') : [];
  const next = details && c && key ? nextChords(key, c) : [];
  const tonics = (mode: KeyMode) => (mode === 'major' ? MAJOR_TONICS : MINOR_TONICS);
  const pickMode: KeyMode = locked?.mode ?? auto?.mode ?? 'major';

  return (
    <main class="screen monitor">
      <header class="bar">
        <span class="drill-name">Was spiele ich?</span>
        <div class="row">
          {details && (
            <button class={locked ? 'pill on' : 'pill'} onClick={() => setPicking(!picking)} aria-expanded={picking} data-testid="key-chip">
              {key ? `Tonart: ${keyName(key.tonic, key.mode, style)}${locked ? '' : ' (auto)'}` : 'Tonart: auto'}
            </button>
          )}
          <button class={details ? 'pill on' : 'pill'} onClick={() => { onSettings({ ...settings, jamDetails: !details }); setPicking(false); }} aria-pressed={details} data-testid="details">
            {details ? 'Weniger' : 'Mehr'}
          </button>
          <button class="quiet" onClick={onExit}>Fertig</button>
        </div>
      </header>

      {details && picking && (
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
        <div class="target" data-testid="chord-name">{big}</div>
        <div class="context" data-testid="chord-function">
          {details && fn && key ? <><b>{fn.roman}</b> in {keyName(key.tonic, key.mode, style)} · {fn.role}</>
            : inversionLine ? inversionLine
            : midi.held.length ? ' '
            : midi.devices.length ? 'Taste, Akkord oder Pad drücken' : 'Kein Keyboard – am FLkey anschließen oder koppeln'}
        </div>
        <p class="meta" data-testid="chord-notes">{padNo !== null ? `Pad ${padNo + 1}  ·  ` : ''}{heldLine}</p>

        <Piano marks={{ held: midi.held, right: melody, dots }} noteNames={style} />

        {details && (
          <div class={`hint ${melodyRole ? (melodyRole.kind === 'target' || melodyRole.kind === 'colour' ? 'ok' : melodyRole.kind === 'avoid' || melodyRole.kind === 'outside' ? 'off' : '') : ''}`} data-testid="melody-line">
            {melodyRole && stickyNamed ? `${melodyName} = ${melodyRole.degree} über ${showChord(stickyNamed, style)}: ${melodyRole.text}`
              : guide ? `Melodie: Zieltöne ${targets.map((t) => `${noteOf(t.pc)} (${t.degree})`).join(', ')}${colours.length ? ` · Farbe ${colours.map((t) => `${noteOf(t.pc)} (${t.degree})`).join(', ')}` : ''}${guide.avoid.length ? ` · nicht liegen lassen: ${guide.avoid.map(noteOf).join(', ')}` : ''}`
              : 'Akkord halten, dann zeigt die Klaviatur die Töne für die Melodie.'}
          </div>
        )}

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
        {midi.devices.length > 0 && midi.held.length === 0 && !c && <p class="meta">🎹 {midi.devices.join(', ')}</p>}
      </section>
    </main>
  );
}
