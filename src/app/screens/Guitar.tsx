import { useMemo, useState } from 'preact/hooks';
import {
  CapoPlan, Chord, Key, PadBank, ProgChord, analyzeProgression, capoPlans, chordsOf, keyLabel, padChord, parseProgression, progressionText,
  soloBoard,
} from '../../core';
import { Fretboard } from '../components/Fretboard';
import { Grip } from '../components/Grip';
import { showChord } from '../lib/names';
import { context } from '../lib/session';
import { Settings, loadBrief } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';

interface Props {
  pads: PadBank;
  settings: Settings;
  onExit: () => void;
}

const CAPOS = [0, 1, 2, 3, 4, 5, 6, 7];

/**
 * Guitar: the loop's chords as strummable grips, the capo that makes them easy, and the scale
 * to play over the loop – frets counted from the capo.
 */
export function Guitar({ pads, settings, onExit }: Props) {
  useWakeLock();
  const padChords = pads.map(padChord).filter((c): c is ProgChord => c !== null);
  const [text, setText] = useState(() => progressionText(padChords));
  const [capoChoice, setCapoChoice] = useState<number | 'auto'>('auto');
  const [pentatonic, setPentatonic] = useState(true);
  const [over, setOver] = useState<number | null>(null);
  const style = settings.noteNames;
  const tuning = context.tuning;

  const parsed = useMemo(() => {
    try {
      return { progs: parseProgression(text), error: '' };
    } catch (e) {
      return { progs: [] as ProgChord[], error: e instanceof Error ? e.message : String(e) };
    }
  }, [text]);
  const chords: Chord[] = useMemo(() => chordsOf(parsed.progs), [parsed.progs]);
  const plans: CapoPlan[] = useMemo(() => (chords.length ? capoPlans(tuning, chords) : []), [chords]);
  const plan = plans.length ? (capoChoice === 'auto' ? plans[0] : plans.find((p) => p.capo === capoChoice) ?? plans[0]) : null;
  const fit = analyzeProgression(parsed.progs)[0];
  const key: Key | null = fit ? { tonic: fit.tonic, mode: fit.mode } : null;
  const overChord = over !== null && chords[over] ? chords[over] : null;
  const dots = key && plan ? soloBoard(tuning, key, plan.capo, pentatonic, overChord) : [];
  const fromBrief = async () => setText((await loadBrief()).chords);
  const scaleName = key ? `${keyLabel(key).split(' ')[0]} ${pentatonic ? (key.mode === 'major' ? 'major pentatonic' : 'minor pentatonic') : key.mode === 'major' ? 'major' : 'natural minor'}` : '';

  return (
    <main class="screen guitar">
      <header class="bar">
        <span class="drill-name">Gitarre · Griffe & Capo</span>
        <button class="quiet" onClick={onExit}>Fertig</button>
      </header>

      <div class="row wrap">
        <input class="field-input big guitar-chords" value={text} placeholder="Dbmaj9 C7#9 Fm9 Ebm9 Ab13" autoComplete="off" spellcheck={false}
          onInput={(e) => { setText((e.target as HTMLInputElement).value); setOver(null); }} data-testid="guitar-chords" />
        <button class="pill" onClick={() => setText(progressionText(padChords))} disabled={padChords.length === 0}>Von den Pads</button>
        <button class="pill" onClick={fromBrief}>Aus dem Steckbrief</button>
      </div>
      {parsed.error && <p class="verdict off small">{parsed.error}</p>}

      <div class="row wrap">
        <span class="field-label">Capo:</span>
        <button class={capoChoice === 'auto' ? 'pill on' : 'pill'} onClick={() => setCapoChoice('auto')}>Auto{plans.length ? ` (${plans[0].capo})` : ''}</button>
        {CAPOS.map((c) => <button class={capoChoice === c ? 'pill on' : 'pill'} onClick={() => setCapoChoice(c)}>{c}</button>)}
      </div>

      {plan && (
        <>
          <p class="context guitar-line" data-testid="capo-line">
            {plan.capo === 0 ? 'Ohne Capo.' : <>Capo auf Bund <b>{plan.capo}</b>: du greifst die Formen darunter, es klingt wie oben.</>}
            {plan.grips.some((g) => g?.simplified) && ' * vereinfacht – die volle Farbe hat keinen leichten Griff.'}
          </p>
          <div class="grips" data-testid="grips">
            {chords.map((c, i) => {
              const g = plan.grips[i];
              return (
                <button class={`grip-card${over === i ? ' on' : ''}`} onClick={() => setOver(over === i ? null : i)} aria-pressed={over === i}>
                  <span class="grip-sound">{showChord(c, style)}</span>
                  {g ? (
                    <>
                      <span class="grip-shape">{plan.capo > 0 || g.simplified ? `Griff: ${showChord(g.plays, style)}${g.simplified ? ' *' : ''}` : ' '}</span>
                      <Grip frets={g.frets} labels={g.labels} title={`${showChord(g.plays, style)} ${g.tab}`} />
                      <span class="grip-tab">{g.tab}</span>
                    </>
                  ) : (
                    <span class="grip-shape">kein Griff</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {key && plan && (
        <section class="solo" data-testid="solo">
          <div class="area-head">
            <h2 class="area-title">Drüberspielen · {scaleName}{plan.capo > 0 ? ` · Bünde ab Capo ${plan.capo}` : ''}</h2>
            <div class="row">
              <button class={pentatonic ? 'pill on' : 'pill'} onClick={() => setPentatonic(true)}>Pentatonic</button>
              <button class={pentatonic ? 'pill' : 'pill on'} onClick={() => setPentatonic(false)}>ganze Scale</button>
            </div>
          </div>
          <p class="meta">{overChord ? `Grün = Zieltöne (3, 7) von ${showChord(overChord, style)}, grau = Akkordtöne, Ringe = Scale. Akkord oben nochmal antippen zum Ausblenden.` : 'Ringe = Scale, R = Grundton. Akkord oben antippen, dann leuchten seine Zieltöne.'}</p>
          <Fretboard tuning={tuning} maxFret={12} board={{ dots }} label="Scale zum Drüberspielen" />
        </section>
      )}

      {!plan && !parsed.error && <p class="meta">Akkorde eintippen oder von den Pads holen. Dann: Griffe, Capo und die Scale zum Drüberspielen.</p>}
    </main>
  );
}
