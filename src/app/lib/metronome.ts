/**
 * Web Audio metronome with a look-ahead scheduler (clicks are placed on the audio clock, so they
 * do not drift with the UI). Reports each beat in performance.now() time so MIDI onsets can be
 * compared against the grid.
 */
export interface MetronomeHandle {
  /** performance.now() of beat 1 of bar 1 – after the count-in. */
  startPerfMs: number;
  bpm: number;
  stop(): void;
}

export type BeatListener = (beat: { bar: number; beat: number; countIn: boolean; atPerfMs: number }) => void;

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

let ctx: AudioContext | null = null;

function click(c: AudioContext, at: number, accent: boolean): void {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1320 : 880;
  gain.gain.setValueAtTime(accent ? 0.5 : 0.3, at);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + 0.05);
}

/** Start clicking; `countInBars` bars precede bar 1. Must be called from a tap (autoplay rules). */
export async function startMetronome(bpm: number, onBeat: BeatListener, countInBars = 1, beatsPerBar = 4): Promise<MetronomeHandle> {
  ctx ??= new AudioContext();
  const c = ctx;
  await c.resume();
  const beatS = 60 / bpm;
  const firstBeatAudio = c.currentTime + 0.1;
  // Same instant on both clocks.
  const perfPerAudio0 = performance.now() - c.currentTime * 1000;
  const toPerf = (audioS: number) => perfPerAudio0 + audioS * 1000;
  const startPerfMs = toPerf(firstBeatAudio + countInBars * beatsPerBar * beatS);
  let next = 0; // beat index from the start of the count-in
  let running = true;
  const timers = new Set<number>();
  const schedule = () => {
    if (!running) return;
    while (firstBeatAudio + next * beatS < c.currentTime + LOOKAHEAD_S) {
      const i = next++;
      const at = firstBeatAudio + i * beatS;
      const inBar = i % beatsPerBar;
      click(c, at, inBar === 0);
      const info = { bar: Math.floor(i / beatsPerBar) - countInBars + 1, beat: inBar + 1, countIn: i < countInBars * beatsPerBar, atPerfMs: toPerf(at) };
      const t = window.setTimeout(() => { timers.delete(t); if (running) onBeat(info); }, Math.max(0, (at - c.currentTime) * 1000));
      timers.add(t);
    }
  };
  schedule();
  const interval = window.setInterval(schedule, TICK_MS);
  return {
    startPerfMs,
    bpm,
    stop() {
      running = false;
      window.clearInterval(interval);
      timers.forEach((t) => window.clearTimeout(t));
    },
  };
}
