/**
 * A small electric-piano voice in Web Audio, so chords and progressions can be heard on the
 * tablet without FL Studio. Two detuned partials per note, a soft attack, a long decay.
 */
let ctx: AudioContext | null = null;
let playing: { stop(): void } | null = null;

const midiHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);

function voice(c: AudioContext, midi: number, at: number, seconds: number, gain: number, out: AudioNode): void {
  const env = c.createGain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.015);
  env.gain.exponentialRampToValueAtTime(gain * 0.35, at + Math.min(0.6, seconds * 0.5));
  env.gain.exponentialRampToValueAtTime(0.0008, at + seconds);
  env.connect(out);
  const partials: [OscillatorType, number, number][] = [['sine', 1, 1], ['triangle', 1.003, 0.35], ['sine', 2, 0.12]];
  for (const [type, ratio, level] of partials) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = midiHz(midi) * ratio;
    const g = c.createGain();
    g.gain.value = level;
    osc.connect(g).connect(env);
    osc.start(at);
    osc.stop(at + seconds + 0.05);
  }
}

async function context(): Promise<AudioContext> {
  ctx ??= new AudioContext();
  await ctx.resume();
  return ctx;
}

export function stopPlayback(): void {
  playing?.stop();
  playing = null;
}

/** One chord, the notes rolled slightly upwards. Must follow a tap (autoplay rules). */
export async function playChord(midis: number[], seconds = 2.2): Promise<void> {
  const c = await context();
  stopPlayback();
  const master = c.createGain();
  master.gain.value = 0.9 / Math.sqrt(Math.max(1, midis.length));
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  master.connect(lp).connect(c.destination);
  const at = c.currentTime + 0.03;
  [...midis].sort((a, b) => a - b).forEach((m, i) => voice(c, m, at + i * 0.025, seconds, 1, master));
  playing = { stop: () => { master.gain.setTargetAtTime(0, c.currentTime, 0.03); } };
}

/**
 * Chords one after another; `beats` per chord at `bpm`, looped `times`. Calls `onChord(index)`
 * as each one starts (-1 at the end) so the screen can follow along.
 */
export async function playProgression(chords: number[][], bpm: number, beats = 4, times = 2, onChord?: (i: number) => void): Promise<void> {
  const c = await context();
  stopPlayback();
  const master = c.createGain();
  master.gain.value = 0.8;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  master.connect(lp).connect(c.destination);
  const chordS = (beats * 60) / bpm;
  const start = c.currentTime + 0.05;
  const timers: number[] = [];
  let n = 0;
  for (let r = 0; r < times; r++) {
    chords.forEach((midis, i) => {
      const at = start + n * chordS;
      const per = 0.9 / Math.sqrt(Math.max(1, midis.length));
      [...midis].sort((a, b) => a - b).forEach((m, k) => voice(c, m, at + k * 0.025, chordS * 0.98, per, master));
      timers.push(window.setTimeout(() => onChord?.(i), Math.max(0, (at - c.currentTime) * 1000)));
      n++;
    });
  }
  timers.push(window.setTimeout(() => { onChord?.(-1); if (playing?.stop === stop) playing = null; }, (start + n * chordS - c.currentTime) * 1000 + 50));
  const stop = () => { timers.forEach((t) => window.clearTimeout(t)); master.gain.setTargetAtTime(0, c.currentTime, 0.03); onChord?.(-1); };
  playing = { stop };
}
