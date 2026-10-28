import { useEffect, useRef, useState } from 'preact/hooks';
import { GENRES, Genre, PLANS, Plan, SessionEntry, TOPICS, Topic, blockLeftMs, fmtCountdown, pickGenre, planMinutes, suggestTopic, weekExports } from '../../core';
import { beep } from '../lib/metronome';
import { useWakeLock } from '../lib/wakeLock';

interface Props {
  sessions: SessionEntry[];
  onDone: (e: SessionEntry) => void;
  /** Jump to the arrangement planner, straight into the reference map when asked. */
  onArrangement: (reference: boolean) => void;
  onExit: () => void;
}

type Phase = 'plan' | 'run' | 'done';

/**
 * Session: pick a plan with a deadline per block, a genre with its constraints and the topic
 * whose turn it is, then a big countdown. Finish, export, log – output over polish.
 */
export function Session({ sessions, onDone, onArrangement, onExit }: Props) {
  useWakeLock();
  const [phase, setPhase] = useState<Phase>('plan');
  const [plan, setPlan] = useState<Plan>(PLANS[0]);
  const [genre, setGenre] = useState<Genre | null>(null);
  const [topic, setTopic] = useState<Topic>(() => suggestTopic(sessions));
  const [block, setBlock] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [extra, setExtra] = useState(0);
  const [doneBlocks, setDoneBlocks] = useState(0);
  const [exported, setExported] = useState(0);
  const [now, setNow] = useState(Date.now());
  const beeped = useRef(false);

  useEffect(() => {
    if (phase !== 'run') return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [phase]);

  const current = plan.blocks[block];
  const left = phase === 'run' ? blockLeftMs(current, startedAt, now, extra) : 0;
  useEffect(() => {
    if (phase === 'run' && left <= 0 && !beeped.current) {
      beeped.current = true;
      void beep().catch(() => {});
    }
  }, [left <= 0, phase]);

  const start = () => {
    setBlock(0);
    setDoneBlocks(0);
    setExtra(0);
    setExported(0);
    setStartedAt(Date.now());
    setNow(Date.now());
    beeped.current = false;
    setPhase('run');
  };
  const next = () => {
    setDoneBlocks(block + 1);
    if (block + 1 >= plan.blocks.length) { setPhase('done'); return; }
    setBlock(block + 1);
    setStartedAt(Date.now());
    setExtra(0);
    beeped.current = false;
  };
  const abort = () => { setDoneBlocks(block); setPhase('done'); };
  const save = () => {
    onDone({ at: Date.now(), planId: plan.id, genreId: genre?.id, topic, blocksDone: doneBlocks, blocks: plan.blocks.length, exported });
    onExit();
  };
  const exportsWeek = weekExports(sessions, Date.now());

  return (
    <main class="screen session">
      <header class="bar">
        <span class="drill-name">Session · {exportsWeek} Export{exportsWeek === 1 ? '' : 's'} in 7 Tagen</span>
        <button class="quiet" onClick={onExit}>Fertig</button>
      </header>

      {phase === 'plan' && (
        <>
          <div class="row wrap">
            <span class="field-label">Plan:</span>
            {PLANS.map((p) => <button class={plan.id === p.id ? 'pill on' : 'pill'} onClick={() => setPlan(p)} data-testid={`plan-${p.id}`}>{p.name}</button>)}
          </div>
          <div class="plan-list" data-testid="plan-blocks">
            {plan.blocks.map((b, i) => (
              <div class="plan-row">
                <span class="plan-no">{i + 1}</span>
                <div>
                  <div class="plan-name">{b.name}</div>
                  <div class="meta">Fertig heißt: {b.done}</div>
                </div>
                <span class="meta">{b.minutes} min</span>
              </div>
            ))}
          </div>
          <div class="row wrap">
            <span class="field-label">Genre:</span>
            {GENRES.map((g) => <button class={genre?.id === g.id ? 'pill on' : 'pill'} onClick={() => setGenre(g)}>{g.name}</button>)}
            <button class="pill" onClick={() => setGenre(pickGenre(Math.floor(Math.random() * 1000)))}>🎲 Zufall</button>
          </div>
          {genre && (
            <div class="genre-card" data-testid="genre-card">
              <div class="plan-name">{genre.name} · {genre.bpm[0]}–{genre.bpm[1]} BPM · {genre.feel}</div>
              <ul>{genre.elements.map((e) => <li>{e}</li>)}</ul>
              <p class="meta">Einschränkung: {genre.constraint} · Vorlage im Arrangement-Planer: {genre.templateId}</p>
            </div>
          )}
          <div class="row wrap">
            <span class="field-label">Thema (dran: {suggestTopic(sessions)}):</span>
            {TOPICS.map((t) => <button class={topic === t ? 'pill on' : 'pill'} onClick={() => setTopic(t)}>{t}</button>)}
          </div>
          <p class="meta">Das Thema ist die Brille für heute: bei „Mix“ zum Beispiel jeden Block mit einem Lautstärke-Check beenden.</p>
          <div class="row wrap">
            <button class="primary" onClick={start} data-testid="start">▶ Los · {planMinutes(plan)} min</button>
            {plan.blocks.some((b) => b.kind === 'reference') && <button class="secondary" onClick={() => onArrangement(true)}>Referenz-Karte öffnen</button>}
          </div>
        </>
      )}

      {phase === 'run' && (
        <section class="focus" data-testid="session-run">
          <p class="eyebrow">{current.name} · Block {block + 1} von {plan.blocks.length}{genre ? ` · ${genre.name}` : ''} · {topic}</p>
          <div class={left < 0 ? 'countdown over' : 'countdown'} data-testid="countdown">{fmtCountdown(left)}</div>
          <p class="context">{left < 0 ? 'Zeit um – abschließen, nicht polieren.' : `Fertig heißt: ${current.done}`}</p>
          {genre && current.kind === 'beat' && <p class="meta">{genre.bpm[0]}–{genre.bpm[1]} BPM · {genre.constraint}</p>}
          {current.kind === 'reference' && <button class="secondary" onClick={() => onArrangement(true)}>Referenz-Karte öffnen</button>}
          <div class="row wrap center">
            <button class="secondary" onClick={() => setExtra(extra + 5 * 60000)}>+5 min</button>
            <button class="primary" onClick={next} data-testid="next">{block + 1 < plan.blocks.length ? '✓ Fertig · nächster Block' : '✓ Fertig'}</button>
          </div>
          <div class="plan-list">
            {plan.blocks.map((b, i) => (
              <div class={`plan-row${i === block ? ' on' : i < block ? ' done' : ''}`}>
                <span class="plan-no">{i < block ? '✓' : i + 1}</span>
                <span class="plan-name">{b.name}</span>
                <span class="meta">{b.minutes} min</span>
              </div>
            ))}
          </div>
          <button class="quiet" onClick={abort}>Abbrechen</button>
        </section>
      )}

      {phase === 'done' && (
        <section class="focus" data-testid="session-done">
          <p class="eyebrow ok">{doneBlocks === plan.blocks.length ? 'Session geschafft' : 'Session beendet'}</p>
          <h1 class="drill-title">{doneBlocks} von {plan.blocks.length} Blöcken</h1>
          <div class="row wrap center">
            <span class="field-label">Exportiert:</span>
            {[0, 1, 2, 3].map((n) => <button class={exported === n ? 'pill on' : 'pill'} onClick={() => setExported(n)}>{n}</button>)}
          </div>
          <p class="meta">Morgen zuerst anhören, ein Satz Notiz. Dann die nächste Session.</p>
          <button class="primary" onClick={save} data-testid="save">Speichern</button>
        </section>
      )}
    </main>
  );
}
