import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  AnswerMode,
  Drill,
  Evaluation,
  LearnerState,
  MelodyChordParams,
  Response,
  SelfRating,
  applyAttempt,
  chord,
  drillProgress,
  evaluate,
  getFamily,
  markPassed,
  nextDrillExercise,
  recommendDrill,
  recordAttempt,
} from '../../core';
import { Fretboard } from '../components/Fretboard';
import { Progress } from '../components/Progress';
import { showChord } from '../lib/names';
import { promptFor, revealFor } from '../lib/prompts';
import { catalog, context, curriculum, rng } from '../lib/session';
import { Settings, logAttempt } from '../lib/store';
import { useWakeLock } from '../lib/wakeLock';

interface Props {
  drill: Drill;
  state: LearnerState;
  settings: Settings;
  onState: (s: LearnerState) => void;
  onDrill: (d: Drill) => void;
  onExit: () => void;
}

type Phase = 'ask' | 'revealed' | 'checked';

const modeFor = (family: string): AnswerMode => (family === 'melody-chord' ? 'tap' : 'play');

export function Practice({ drill, state, settings, onState, onDrill, onExit }: Props) {
  useWakeLock();
  const [round, setRound] = useState(0);
  const next = useMemo(() => nextDrillExercise(state, drill, catalog, rng, Date.now(), context), [round, drill.id]);
  const { exercise, helpLevel } = next;
  const mode = modeFor(exercise.family);
  const [phase, setPhase] = useState<Phase>('ask');
  const [shownAt, setShownAt] = useState(() => performance.now());
  const [latency, setLatency] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [justPassed, setJustPassed] = useState(false);

  useEffect(() => {
    setPhase('ask');
    setPicked([]);
    setEvaluation(null);
    setShownAt(performance.now());
  }, [exercise.id, round]);

  const style = settings.noteNames;
  const prompt = promptFor(exercise, helpLevel, style);
  const reveal = revealFor(exercise, style);
  const progress = drillProgress(state, drill);

  const commit = (response: Response, ms: number) => {
    const attempt = recordAttempt(exercise, response, { mode, latencyMs: Math.round(ms), helpLevel, at: Date.now() });
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
    setRound((r) => r + 1);
  };
  const check = () => {
    const ms = performance.now() - shownAt;
    const response: Response = { kind: 'choices', ids: picked };
    setEvaluation(evaluate(exercise, response));
    commit(response, ms);
    setPhase('checked');
  };
  const advance = () => setRound((r) => r + 1);

  // Keyboard (tablet with keyboard, or a foot pedal that sends keys): space/enter, 1–3.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (justPassed) return;
      if (phase === 'ask' && mode === 'play' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); doReveal(); }
      else if (phase === 'revealed' && ['1', '2', '3'].includes(e.key)) rate((['miss', 'found', 'instant'] as const)[Number(e.key) - 1]);
      else if (phase === 'checked' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); advance(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const nextDrill = recommendDrill(state, curriculum, drill.track);
  const showBoard = phase === 'ask' ? prompt.board : reveal.board;

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
            <div class="target">{prompt.main}</div>
            {prompt.sub && <div class="context">{prompt.sub}</div>}
            {phase === 'ask' && prompt.hint && <div class="hint">{prompt.hint}</div>}
            {phase !== 'ask' && reveal.lines.length > 0 && (
              <div class="solution">{reveal.lines.map((l) => <div>{l}</div>)}</div>
            )}
          </section>

          {showBoard && mode === 'play' && (
            <section class="board">
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
                <button class="rate-btn miss" onClick={() => rate('miss')}>✗ Daneben</button>
                <button class="rate-btn found" onClick={() => rate('found')}>Gefunden</button>
                <button class="rate-btn instant" onClick={() => rate('instant')}>✓ Sofort</button>
              </div>
            )}
            {mode === 'tap' && phase === 'ask' && <button class="primary" disabled={picked.length === 0} onClick={check}>Prüfen</button>}
            {mode === 'tap' && phase === 'checked' && (
              <>
                <p class={evaluation?.correct ? 'verdict ok' : 'verdict off'}>{evaluation?.correct ? '✓ Richtig' : '✗ Nicht ganz'}</p>
                <button class="primary" onClick={advance}>Weiter</button>
              </>
            )}
          </section>
        </>
      )}
    </main>
  );
}
