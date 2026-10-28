import { useEffect, useState } from 'preact/hooks';
import {
  EMPTY_JAM, INVERSION_NAMES, Key, KeyMode, MAJOR_TONICS, MINOR_TONICS, PadBank, autoKey, chord, chordFunction, degreeSemitones,
  degreeToString, identifyHeld, jamStep, keyScale, melodyGuide, melodyNoteRole, melodyNotes, nextChords, notePc, padFor, parseNote, pcToNote,
  spellInKey, toPc,
} from '../../core';
import { DotKind, Piano, PianoMarks } from '../components/Piano';
import { keyName, showChord, showDegree, showNote } from '../lib/names';
import { useMidi } from '../lib/midi';
import { FoundChord, Settings, loadFound, saveFound } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  /** What is on the FLkey pads, so the screen can say "Pad 3" and put a found chord on a free pad. */
  pads: PadBank;
  onPads: (b: PadBank) => void;
  onExit: () => void;
}

type Mode = 'overview' | 'chords' | 'melody';
const MODES: [Mode, string][] = [['overview', 'Überblick'], ['chords', 'Akkorde'], ['melody', 'Melodie']];
const PIANO_LOW = 48;
const PIANO_HIGH = 84;
const OVER_ROOT = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

/**
 * "Was spiele ich?" in three modes. Überblick: the chord the held keys make right now, each tone's
 * role, and the chords found and kept. Akkorde: the key (read or set), the chord's function and
 * what tends to come next. Melodie: which tones sit on the chord. The last two lean on a sticky
 * chord that survives the pad being released.
 */
export function ChordMonitor({ settings, onSettings, pads, onPads, onExit }: Props) {
  useWakeLock();
  const [jam, setJam] = useState(EMPTY_JAM);
  const [auto, setAuto] = useState<Key | null>(null);
  const [picking, setPicking] = useState(false);
  const [found, setFound] = useState<FoundChord[]>([]);
  const [shown, setShown] = useState<FoundChord | null>(null);
  const [note, setNote] = useState('');
  const midi = useMidi((settled) => setJam((j) => jamStep(j, settled)), 3);
  useEffect(() => setAuto((k) => autoKey(jam.history, k)), [jam.history]);
  useEffect(() => void loadFound().then(setFound), []);
  useEffect(() => { if (midi.held.length) setShown(null); }, [midi.held.length]);

  const style = settings.noteNames;
  const mode: Mode = settings.jamMode ?? 'overview';
  const setMode = (m: Mode) => { onSettings({ ...settings, jamMode: m }); setPicking(false); };
  const locked: Key | null = settings.jamKey ? { tonic: parseNote(settings.jamKey.tonic), mode: settings.jamKey.mode } : null;
  const key = locked ?? auto;
  const setKey = (k: { tonic: string; mode: KeyMode } | null) => onSettings({ ...settings, jamKey: k });
  const noteOf = (pc: number) => showNote(key ? spellInKey(keyScale(key), pc).note : pcToNote(pc, 'flat'), style);
  const nameOf = (midis: number[]) => {
    const h = identifyHeld(midis);
    return h ? showChord(chord(key ? spellInKey(keyScale(key), h.rootPc).note : pcToNote(h.rootPc, 'flat'), h.type.id), style) : midis.map((m) => noteOf(toPc(m))).join(' ');
  };

  // Live: whatever is down right now.
  const live = identifyHeld(midi.held);
  const heldSorted = [...midi.held].sort((a, b) => a - b);
  const roleIn = (pc: number): string => {
    if (!live) return '';
    const d = live.type.formula.find((f) => toPc(live.rootPc + degreeSemitones(f)) === pc);
    return showDegree(d ? degreeToString(d) : OVER_ROOT[toPc(pc - live.rootPc)]);
  };
  const heldLine = heldSorted.map((m) => (live ? `${noteOf(toPc(m))} (${roleIn(toPc(m))})` : noteOf(toPc(m)))).join('  ·  ');
  const padNo = padFor(pads, midi.held);
  const inversionLine = live && live.inversion > 0 ? `tiefster Ton ${noteOf(live.bassPc)} · ${INVERSION_NAMES[live.inversion] ?? `${live.inversion}. inversion`}` : '';

  // Sticky: the chord the details lean on.
  const c = jam.chord;
  const fn = c && key ? chordFunction(key, c) : null;
  const stickyNamed = c ? chord(fn ? fn.root : pcToNote(c.rootPc, 'flat'), c.typeId) : null;
  const big = live ? nameOf(midi.held) : shown ? nameOf(shown.midis) : mode !== 'overview' && stickyNamed ? showChord(stickyNamed, style) : heldSorted.length ? heldSorted.map((m) => noteOf(toPc(m))).join(' ') : ' ';

  const guide = mode === 'melody' && c ? melodyGuide(key, c) : null;
  const melody = mode === 'melody' ? melodyNotes(jam, midi.held) : [];
  const dots: PianoMarks['dots'] = {};
  if (guide) {
    for (let m = PIANO_LOW; m <= PIANO_HIGH; m++) {
      const pc = toPc(m);
      const tone = guide.tones.find((t) => t.pc === pc);
      const kind: DotKind | null = tone ? tone.weight : guide.avoid.includes(pc) ? 'avoid' : guide.scalePcs.includes(pc) ? 'safe' : null;
      if (kind) dots[m] = { kind, label: tone ? showDegree(tone.degree) : kind === 'avoid' ? '11' : undefined };
    }
  }
  const melodyRole = c && melody.length ? melodyNoteRole(key, c, toPc(melody[melody.length - 1])) : null;
  const melodyName = melody.length ? noteOf(toPc(melody[melody.length - 1])) : '';
  const targets = guide ? guide.tones.filter((t) => t.weight === 'target') : [];
  const colours = guide ? guide.tones.filter((t) => t.weight === 'colour') : [];
  const next = mode === 'chords' && c && key ? nextChords(key, c) : [];
  const tonics = (m: KeyMode) => (m === 'major' ? MAJOR_TONICS : MINOR_TONICS);
  const pickMode: KeyMode = locked?.mode ?? auto?.mode ?? 'major';

  const keep = () => {
    if (!live) return;
    const entry = { at: Date.now(), midis: heldSorted };
    const list = [...found.filter((f) => f.midis.join() !== entry.midis.join()), entry];
    setFound(list);
    void saveFound(list);
    setNote(`Gemerkt: ${nameOf(entry.midis)}`);
  };
  const drop = (f: FoundChord) => {
    const list = found.filter((x) => x !== f);
    setFound(list);
    void saveFound(list);
    if (shown === f) setShown(null);
  };
  const toPad = (f: FoundChord) => {
    const free = pads.findIndex((p) => p === null);
    if (free < 0) { setNote('Alle 16 Pads belegt – in der Pad-Karte eins leeren.'); return; }
    onPads(pads.map((p, i) => (i === free ? { midis: f.midis } : p)));
    setNote(`${nameOf(f.midis)} liegt in der Pad-Karte auf Pad ${free + 1}. Am FLkey noch einspeichern.`);
  };

  return (
    <main class="screen monitor">
      <header class="bar">
        <span class="drill-name">Was spiele ich?</span>
        <div class="row">
          <div class="seg" role="tablist" aria-label="Modus">
            {MODES.map(([m, label]) => <button class={mode === m ? 'seg-btn on' : 'seg-btn'} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} data-testid={`mode-${m}`}>{label}</button>)}
          </div>
          <button class="quiet" onClick={onExit}>Fertig</button>
        </div>
      </header>

      {mode !== 'overview' && (
        <div class="row wrap">
          <button class={locked ? 'pill on' : 'pill'} onClick={() => setPicking(!picking)} aria-expanded={picking} data-testid="key-chip">
            {key ? `Tonart: ${keyName(key.tonic, key.mode, style)}${locked ? ' (festgelegt)' : ' (erkannt)'}` : 'Tonart festlegen'}
          </button>
          {!locked && key && <span class="meta">Erkannt aus dem, was du spielst – antippen zum Festlegen.</span>}
        </div>
      )}
      {mode !== 'overview' && picking && (
        <section class="key-pick" aria-label="Tonart wählen">
          <button class={locked ? 'pill' : 'pill on'} onClick={() => setKey(null)}>Erkennen</button>
          <span class="pill sep">·</span>
          {(['major', 'naturalMinor'] as KeyMode[]).map((m) => (
            <button class={pickMode === m ? 'pill on' : 'pill'}
              onClick={() => setKey({ tonic: locked ? tonics(m)[tonics(locked.mode).findIndex((t) => notePc(parseNote(t)) === notePc(locked.tonic))] : tonics(m)[0], mode: m })}>
              {m === 'major' ? 'major' : 'minor'}
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
          {mode === 'chords' && fn && key && (live || c) ? <><b>{fn.roman}</b> in {keyName(key.tonic, key.mode, style)} · {fn.role}</>
            : inversionLine ? inversionLine
            : midi.held.length || shown ? ' '
            : midi.devices.length ? 'Taste, Akkord oder Pad drücken' : 'Kein Keyboard – am FLkey anschließen oder koppeln'}
        </div>
        <p class="meta" data-testid="chord-notes">{padNo !== null ? `Pad ${padNo + 1}  ·  ` : ''}{heldLine || (shown ? shown.midis.map((m) => noteOf(toPc(m))).join('  ·  ') : '')}</p>

        <Piano marks={{ held: midi.held, right: shown && !midi.held.length ? shown.midis : melody, dots }} noteNames={style} />

        {mode === 'overview' && (
          <div class="found" data-testid="found">
            <div class="row wrap center">
              <button class="secondary" onClick={keep} disabled={!live} data-testid="keep">★ Merken</button>
              {note && <span class="verdict small ok">{note}</span>}
            </div>
            {found.length > 0 && (
              <div class="found-list">
                <span class="next-label">Gemerkt</span>
                <div class="row wrap center">
                  {[...found].reverse().map((f) => (
                    <span class={`found-chip${shown === f ? ' on' : ''}`}>
                      <button class="found-name" onClick={() => setShown(shown === f ? null : f)} title="Auf der Klaviatur zeigen">{nameOf(f.midis)}</button>
                      <button class="found-act" onClick={() => toPad(f)} title="Auf ein freies Pad">Pad</button>
                      <button class="found-act" onClick={() => drop(f)} aria-label="Entfernen">×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === 'melody' && (
          <div class={`hint ${melodyRole ? (melodyRole.kind === 'target' || melodyRole.kind === 'colour' ? 'ok' : melodyRole.kind === 'avoid' || melodyRole.kind === 'outside' ? 'off' : '') : ''}`} data-testid="melody-line">
            {melodyRole && stickyNamed ? `${melodyName} = ${showDegree(melodyRole.degree)} über ${showChord(stickyNamed, style)}: ${melodyRole.text}`
              : guide ? `Zieltöne ${targets.map((t) => `${noteOf(t.pc)} (${showDegree(t.degree)})`).join(', ')}${colours.length ? ` · Farbe ${colours.map((t) => `${noteOf(t.pc)} (${showDegree(t.degree)})`).join(', ')}` : ''}${guide.avoid.length ? ` · nicht liegen lassen: ${guide.avoid.map(noteOf).join(', ')}` : ''}`
              : 'Akkord halten (Pad), dann zeigt die Klaviatur die Töne für die Melodie: grün Zieltöne, weiß Farbe, Punkte Scale.'}
          </div>
        )}

        {mode === 'chords' && (
          next.length > 0 ? (
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
          ) : <p class="meta">Akkord spielen, dann kommen Stufe und Vorschläge in der Tonart.</p>
        )}
        {midi.devices.length > 0 && midi.held.length === 0 && !c && !shown && <p class="meta">🎹 {midi.devices.join(', ')}</p>}
      </section>
    </main>
  );
}
