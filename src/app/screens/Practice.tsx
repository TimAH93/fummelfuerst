import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  AnswerMode,
  Drill,
  Evaluation,
  LearnerState,
  MelodyChordParams,
  PadBank,
  Response,
  SelfRating,
  applyAttempt,
  Note,
  chord,
  chordPcs,
  drillProgress,
  evaluate,
  getFamily,
  markPassed,
  nextSessionExercise,
  padFor,
  planSession,
  recommendDrill,
  recordAttempt,
} from '../../core';
import { Fretboard } from '../components/Fretboard';
import { Piano, PianoMarks } from '../components/Piano';
import { useMidi } from '../lib/midi';
import { Progress } from '../components/Progress';
import { feedbackFor } from '../lib/feedback';
import { showChord } from '../lib/names';
import { promptFor, revealFor } from '../lib/prompts';
import { playNotes } from '../lib/synth';
import { context, curriculum, rng } from '../lib/session';
import { Settings, logAttempt } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';
import { useKeyRange } from '../lib/keyRange';

interface Props {
  drill: Drill;
  state: LearnerState;
  settings: Settings;
  onState: (s: LearnerState) => void;
  onDrill: (d: Drill) => void;
  onExit: () => void;
  /** Stored pads: a chord equal to one is still accepted, but the meta line says so. */
  pads?: PadBank;
}

type Phase = 'ask' | 'revealed' | 'checked';

const KEY_FAMILIES = ['keys-chord', 'keys-voicing'];
const TAP_FAMILIES = ['melody-chord', ...KEY_FAMILIES];
const modeFor = (family: string): AnswerMode => (TAP_FAMILIES.includes(family) ? 'tap' : 'play');

/** Rating buttons left to right; keys 1–4 follow the same order. */
const RATINGS: readonly { rating: SelfRating; label: string }[] = [
  { rating: 'miss', label: '✗ Daneben' },
  { rating: 'near', label: '≈ Fast' },
  { rating: 'found', label: 'Gefunden' },
  { rating: 'instant', label: '✓ Sofort' },
];

export function Practice({ drill, state, settings, onState, onDrill, onExit, pads }: Props) {
  useWakeLock();
  const [round, setRound] = useState(0);
  // The plan is recomputed per round: the recommended drill plus labelled review picks from the same track.
  const next = useMemo(() => {
    const now = Date.now();
    const plan = planSession(state, curriculum, drill, now);
    return nextSessionExercise(state, plan, rng, now, context);
  }, [round, drill.id]);
  const { exercise, helpLevel, review } = next;
  const mode = modeFor(exercise.family);
  const [phase, setPhase] = useState<Phase>('ask');
  const [shownAt, setShownAt] = useState(() => performance.now());
  const [latency, setLatency] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [justPassed, setJustPassed] = useState(false);
  const [tapped, setTapped] = useState<number[]>([]);
  const [played, setPlayed] = useState<number[]>([]);
  const [padHit, setPadHit] = useState(false);
  const isKeys = KEY_FAMILIES.includes(exercise.family);
  // Sound prompts may only start after a tap (autoplay rules): armed by the first rating/Weiter, never on mount.
  const armed = useRef(false);

  useEffect(() => {
    setPhase('ask');
    setPicked([]);
    setTapped([]);
    setPlayed([]);
    setPadHit(false);
    setEvaluation(null);
    setShownAt(performance.now());
  }, [exercise.id, round]);

  const style = settings.noteNames;
  const prompt = promptFor(exercise, helpLevel, style);
  const reveal = revealFor(exercise, style);
  // Help level 3 hides the name while asking; the reveal shows it again.
  const shownMain = prompt.hideName && phase !== 'ask' ? promptFor(exercise, 0, style).main : prompt.main;

  useEffect(() => {
    if (armed.current && prompt.sound) void playNotes(prompt.sound);
  }, [exercise.id, round]);
  const progress = drillProgress(state, drill);
  // Tap families only: one amber clause under the verdict; self-rated (play) answers never get one.
  const feedback = mode === 'tap' && phase === 'checked' && evaluation ? feedbackFor(exercise, evaluation, style) : null;

  const commit = (response: Response, ms: number) => {
    const attempt = recordAttempt(exercise, response, { mode, latencyMs: Math.round(ms), helpLevel, at: Date.now() });
    // "Sitzt" is about the recommended drill, also when this round was a review pick.
    const wasPassed = state.passed[drill.id] !== undefined;
    const updated = markPassed(applyAttempt(state, attempt, getFamily(exercise.family).tempo), curriculum, Date.now());
    if (!wasPassed && updated.passed[drill.id] !== undefined) setJustPassed(true);
    onState(updated);
    void logAttempt(attempt);
    return attempt.evaluation;
  };

  const doReveal = () => {
    setLatency(performance.now() - shownAt);
    setPhase('revealed');
  };
  const rate = (rating: SelfRating) => {
    commit({ kind: 'self', rating }, latency);
    armed.current = true;
    setRound((r) => r + 1);
  };
  const submit = (response: Response) => {
    const ms = performance.now() - shownAt;
    setEvaluation(evaluate(exercise, response));
    commit(response, ms);
    setPhase('checked');
  };
  const submitNotes = (midis: number[]) => {
    setPlayed(midis);
    submit({ kind: 'notes', midis });
  };
  const check = () => (isKeys ? submitNotes(tapped) : submit({ kind: 'choices', ids: picked }));
  // A chord held still on the MIDI keyboard answers by itself – hands stay on the keys.
  // A chord equal to a stored pad is still accepted (a hand-built close voicing can be identical), but the meta line says so.
  const midi = useMidi((midis) => {
    if (isKeys && phase === 'ask' && !justPassed) {
      setPadHit(pads !== undefined && padFor(pads, midis) !== null);
      submitNotes(midis);
    }
  });
  const advance = () => {
    armed.current = true;
    setRound((r) => r + 1);
  };

  // Keyboard (tablet with keyboard, or a foot pedal that sends keys): space/enter, 1–4.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (justPassed) return;
      if (phase === 'ask' && mode === 'play' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); doReveal(); }
      else if (phase === 'revealed' && ['1', '2', '3', '4'].includes(e.key)) rate(RATINGS[Number(e.key) - 1].rating);
      else if (phase === 'checked' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); advance(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const nextDrill = recommendDrill(state, curriculum, drill.track);
  const showBoard = phase === 'ask' ? prompt.board : reveal.board;
  const keysSolution = isKeys ? (exercise.solution as { notes: number[] }).notes : [];
  // Every tone of the asked chord counts as right (a voicing may leave the fifth out or double a tone).
  const keysParams = exercise.params as { root?: Note; typeId?: string };
  const chordPcsNow = isKeys && keysParams.root && keysParams.typeId ? chordPcs(chord(keysParams.root, keysParams.typeId)) : [];
  const [pianoLow, pianoHigh] = useKeyRange([...midi.held, ...tapped, ...played, ...keysSolution]);
  const pianoMarks: PianoMarks =
    phase === 'ask'
      ? { held: [...new Set([...midi.held, ...tapped])] }
      : evaluation?.correct
        ? { right: played }
        : { held: played, right: keysSolution, wrong: played.filter((m) => !chordPcsNow.includes(m % 12)) };

  return (
    <main class="screen practice">
      <header class="bar">
        <div class="drill-head">
          <span class="drill-name">{drill.title}</span>
          <Progress value={progress.progress} label="Fortschritt im Drill" />
        </div>
        <button class="quiet" onClick={onExit}>Fertig</button>
      </header>

      {justPassed ? (
        <section class="focus">
          <p class="eyebrow ok">Sitzt</p>
          <h1 class="drill-title">{drill.title}</h1>
          <p class="meta">Du entscheidest: dranbleiben oder weiter.</p>
          <div class="actions">
            <button class="secondary" onClick={() => { setJustPassed(false); advance(); }}>Weiter üben</button>
            {nextDrill && nextDrill.id !== drill.id && (
              <button class="primary" onClick={() => onDrill(nextDrill)}>Nächster: {nextDrill.title}</button>
            )}
          </div>
        </section>
      ) : (
        <>
          <section class="question">
            {review && <p class="eyebrow review">Wiederholung · {review.title}</p>}
            <div class="target">{shownMain}</div>
            {prompt.sub && <div class="context">{prompt.sub}</div>}
            {prompt.sound && (
              <button class="quiet" aria-label="Nochmal hören" onClick={() => void playNotes(prompt.sound!)}>🔊 Nochmal</button>
            )}
            {phase === 'ask' && prompt.hint && <div class="hint">{prompt.hint}</div>}
            {phase !== 'ask' && reveal.lines.length > 0 && (
              <div class="solution">{reveal.lines.map((l) => <div>{l}</div>)}</div>
            )}
          </section>

          {isKeys && (
            <section class={phase === 'ask' ? 'keys' : 'keys done'}>
              <Piano low={pianoLow} high={pianoHigh} marks={pianoMarks} noteNames={style}
                onToggle={phase === 'ask' ? (m) => setTapped(tapped.includes(m) ? tapped.filter((x) => x !== m) : [...tapped, m]) : undefined} />
              <p class={padHit ? 'meta pad-hint' : 'meta'}>
                {padHit
                  ? 'Pad erkannt – Töne bitte greifen'
                  : midi.devices.length ? `🎹 ${midi.devices.join(', ')}` : 'Kein Keyboard – Tasten antippen oder auf der Startseite koppeln'}
              </p>
            </section>
          )}

          {showBoard && (mode === 'play' || (isKeys && phase === 'checked')) && (
            <section class={isKeys ? 'board bridge' : 'board'}>
              <Fretboard tuning={exercise.context.tuning} maxFret={exercise.context.range.maxFret} board={showBoard} label="Griffbrett" />
            </section>
          )}

          {mode === 'tap' && exercise.family === 'melody-chord' && (
            <section class="chips">
              {(exercise.params as MelodyChordParams).choices.map((c) => {
                const on = picked.includes(c.id);
                const right = evaluation && (exercise.solution as { chords: { id: string }[] }).chords.some((x) => x.id === c.id);
                const cls = phase === 'checked' ? (right ? (on ? 'chip right' : 'chip missed') : on ? 'chip wrong' : 'chip') : on ? 'chip on' : 'chip';
                return (
                  <button class={cls} aria-pressed={on} disabled={phase === 'checked'}
                    onClick={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])}>
                    <span class="chip-name">{showChord(chord(c.root, c.typeId), style)}</span>
                    {helpLevel === 0 && <span class="chip-roman">{c.roman}</span>}
                  </button>
                );
              })}
            </section>
          )}

          <section class="actions">
            {mode === 'play' && phase === 'ask' && <button class="primary" onClick={doReveal}>Aufdecken</button>}
            {mode === 'play' && phase === 'revealed' && (
              <div class="rate">
                {RATINGS.map(({ rating, label }) => (
                  <button class={`rate-btn ${rating}`} onClick={() => rate(rating)}>{label}</button>
                ))}
              </div>
            )}
            {mode === 'tap' && phase === 'ask' && (
              <button class="primary" disabled={isKeys ? tapped.length < 3 : picked.length === 0} onClick={check}>Prüfen</button>
            )}
            {mode === 'tap' && phase === 'checked' && (
              <>
                <p class={evaluation?.correct ? 'verdict ok' : 'verdict off'}>{evaluation?.correct ? '✓ Richtig' : '✗ Nicht ganz'}</p>
                {feedback && <p class="feedback">{feedback}</p>}
                <button class="primary" onClick={advance}>Weiter</button>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
