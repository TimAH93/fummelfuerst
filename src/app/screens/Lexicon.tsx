import { useEffect, useState } from 'preact/hooks';
import {
  Key, KeyMode, LEXICON, LexProgression, MAJOR_TONICS, MINOR_TONICS, PadBank, ProgChord, chord, exampleChord, keyScale, noteName, notePc,
  parseNote, realize, spellInKey, suggestVoicing, writeMidi,
} from '../../core';
import { Piano } from '../components/Piano';
import { downloadBytes } from '../lib/download';
import { sendFile } from '../lib/link';
import { keyName, showChord } from '../lib/names';
import { FoundChord, Settings, loadFound, saveFound } from '../lib/store';
import { playChord, playProgression, stopPlayback } from '../lib/synth';
import { useWakeLock } from '../lib/wakeLock';
import { useKeyRange } from '../lib/keyRange';
import { useLink } from './Link';

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  pads: PadBank;
  onPads: (b: PadBank) => void;
  onTrain: (chords: ProgChord[], bpm: number) => void;
  onExit: () => void;
}

/**
 * Lexicon: chords worth knowing and the progressions behind whole genres, in a key of choice,
 * to hear on the tablet, see on the keys, keep, or put on the pads.
 */
export function Lexicon({ settings, onSettings, pads, onPads, onTrain, onExit }: Props) {
  useWakeLock();
  const link = useLink();
  const [genreId, setGenreId] = useState(LEXICON[0].id);
  const [shown, setShown] = useState<number[]>([]);
  const [playingIdx, setPlayingIdx] = useState<{ name: string; i: number } | null>(null);
  const [found, setFound] = useState<FoundChord[]>([]);
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState(false);
  useEffect(() => void loadFound().then(setFound), []);
  useEffect(() => () => stopPlayback(), []);

  const style = settings.noteNames;
  const key: Key = settings.jamKey ? { tonic: parseNote(settings.jamKey.tonic), mode: settings.jamKey.mode } : { tonic: parseNote('Db'), mode: 'major' };
  const setKey = (tonic: string, mode: KeyMode) => onSettings({ ...settings, jamKey: { tonic, mode } });
  const genre = LEXICON.find((g) => g.id === genreId) ?? LEXICON[0];
  const named = (c: ProgChord) => chord(spellInKey(keyScale(key), c.rootPc).note, c.typeId);
  const label = (c: ProgChord) => showChord(named(c), style);
  const tonics = key.mode === 'major' ? MAJOR_TONICS : MINOR_TONICS;
  const [pianoLow, pianoHigh] = useKeyRange(shown);

  const hear = (c: ProgChord) => { const v = suggestVoicing(c); setShown(v); void playChord(v).catch(() => {}); };
  const keep = (c: ProgChord) => {
    const entry = { at: Date.now(), midis: suggestVoicing(c) };
    const list = [...found.filter((f) => f.midis.join() !== entry.midis.join()), entry];
    setFound(list);
    void saveFound(list);
    setNote(`Gemerkt: ${label(c)} – steht im Jam-Screen unter „Gemerkt“.`);
  };
  const toPad = (c: ProgChord) => {
    const free = pads.findIndex((p) => p === null);
    if (free < 0) { setNote('Alle 16 Pads belegt – in der Pad-Karte eins leeren.'); return; }
    onPads(pads.map((p, i) => (i === free ? { midis: suggestVoicing(c) } : p)));
    setNote(`${label(c)} liegt in der Pad-Karte auf Pad ${free + 1}.`);
  };
  const chordsOf = (p: LexProgression): ProgChord[] => realize(p.romans, { tonic: key.tonic, mode: p.mode });
  const hearProg = (p: LexProgression) => {
    const cs = chordsOf(p);
    const voicings = cs.map(suggestVoicing);
    void playProgression(voicings, p.bpm, 4, 2, (i) => { setPlayingIdx(i >= 0 ? { name: p.name, i } : null); setShown(i >= 0 ? voicings[i] : []); }).catch(() => {});
  };
  const progToPads = (p: LexProgression) => {
    const cs = chordsOf(p);
    if (cs.length > pads.length) { setNote('Zu viele Akkorde für 16 Pads.'); return; }
    onPads(pads.map((old, i) => (i < cs.length ? { midis: suggestVoicing(cs[i]) } : old)));
    setNote(`${p.name}: Pads 1–${cs.length} in der Pad-Karte belegt. Am FLkey noch einspeichern.`);
  };
  const progMidi = (p: LexProgression, pc: boolean) => {
    const cs = chordsOf(p);
    const events = cs.flatMap((c, i) => suggestVoicing(c).map((m, k) => ({ midi: m, startBeat: i * 4 + k / 32, beats: 4 - k / 32 })));
    const name = `${p.name} ${noteName(key.tonic)} ${p.mode === 'major' ? 'major' : 'minor'}.mid`;
    const bytes = writeMidi(events, p.bpm, p.name);
    if (pc) setNote(sendFile(name, 'audio/midi', bytes) ? `An den PC geschickt: ${name}` : 'Kein PC gekoppelt');
    else { downloadBytes(name, 'audio/midi', bytes); setNote(`Gespeichert: ${name}`); }
  };
  const progKey = (p: LexProgression): Key => ({ tonic: key.tonic, mode: p.mode });

  return (
    <main class="screen lexicon">
      <header class="bar">
        <span class="drill-name">Lexikon · Akkorde & Folgen</span>
        <div class="row wrap">
          <button class="pill on" onClick={() => setPicking(!picking)} aria-expanded={picking} data-testid="lex-key">Tonart: {keyName(key.tonic, key.mode, style)}</button>
          <button class="quiet" onClick={() => { stopPlayback(); onExit(); }}>Fertig</button>
        </div>
      </header>

      {picking && (
        <section class="key-pick" aria-label="Tonart wählen">
          {(['major', 'naturalMinor'] as KeyMode[]).map((m) => (
            <button class={key.mode === m ? 'pill on' : 'pill'} onClick={() => setKey((m === 'major' ? MAJOR_TONICS : MINOR_TONICS)[(m === 'major' ? MAJOR_TONICS : MINOR_TONICS).findIndex((t) => notePc(parseNote(t)) === notePc(key.tonic))] ?? 'C', m)}>
              {m === 'major' ? 'major' : 'minor'}
            </button>
          ))}
          <span class="pill sep">·</span>
          {tonics.map((t) => <button class={notePc(parseNote(t)) === notePc(key.tonic) ? 'pill on' : 'pill'} onClick={() => setKey(t, key.mode)}>{t}</button>)}
        </section>
      )}

      <div class="row wrap" role="tablist" aria-label="Genre">
        {LEXICON.map((g) => <button class={g.id === genreId ? 'pill on' : 'pill'} role="tab" aria-selected={g.id === genreId} onClick={() => { setGenreId(g.id); stopPlayback(); setPlayingIdx(null); }} data-testid={`genre-${g.id}`}>{g.name}</button>)}
      </div>

      <section class="lex-section">
        <h2 class="area-title">Akkorde</h2>
        <div class="lex-grid" data-testid="lex-chords">
          {genre.chords.map((lc) => {
            const c = exampleChord(key, lc.typeId);
            return (
              <div class="lex-card">
                <span class="lex-name">{label(c)}</span>
                <span class="lex-sound">{lc.sound}</span>
                <span class="meta">Gehört bei: {lc.heard}</span>
                <div class="row wrap lex-actions">
                  <button class="pill" onClick={() => hear(c)} aria-label={`${label(c)} anhören`}>▶ Anhören</button>
                  <button class="pill" onClick={() => keep(c)}>★ Merken</button>
                  <button class="pill" onClick={() => toPad(c)}>Auf Pad</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section class="lex-section">
        <h2 class="area-title">Folgen</h2>
        <div class="lex-grid" data-testid="lex-progs">
          {genre.progressions.map((p) => {
            const cs = chordsOf(p);
            return (
              <div class="lex-card">
                <span class="lex-name">{p.name}</span>
                <span class="lex-romans">{p.romans.join(' – ')} · {keyName(key.tonic, p.mode, style)} · {p.bpm} BPM</span>
                <div class="row wrap lex-chain">
                  {cs.map((c, i) => <span class={`lex-chip${playingIdx?.name === p.name && playingIdx.i === i ? ' on' : ''}`}>{showChord(chord(spellInKey(keyScale(progKey(p)), c.rootPc).note, c.typeId), style)}</span>)}
                </div>
                <span class="lex-sound">{p.sound}</span>
                <div class="row wrap lex-actions">
                  <button class="pill" onClick={() => (playingIdx?.name === p.name ? stopPlayback() : hearProg(p))} data-testid={`play-${p.name}`}>{playingIdx?.name === p.name ? '■ Stopp' : '▶ Anhören'}</button>
                  <button class="pill" onClick={() => { stopPlayback(); onTrain(cs, Math.max(40, Math.round(p.bpm * 0.6))); }}>Üben</button>
                  <button class="pill" onClick={() => progToPads(p)}>Auf Pads 1–{cs.length}</button>
                  <button class="pill" onClick={() => progMidi(p, false)}>MIDI</button>
                  <button class="pill" onClick={() => progMidi(p, true)} disabled={link.status !== 'connected' || link.role !== 'host'}>An PC</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {note && <p class="verdict small ok center" data-testid="lex-note">{note}</p>}
      <Piano low={pianoLow} high={pianoHigh} marks={{ held: shown }} noteNames={style} />
    </main>
  );
}
