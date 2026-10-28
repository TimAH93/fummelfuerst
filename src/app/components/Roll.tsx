import { GridNote } from '../../core';

/** A small piano roll: beats left to right, pitch bottom to top, bar lines every four beats. */
export function Roll({ notes, beats, live }: { notes: GridNote[]; beats: number; live?: { midi: number; startBeat: number } | null }) {
  const all = live ? [...notes, { ...live, beats: Math.max(0.25, beats - live.startBeat) }] : notes;
  const midis = all.map((n) => n.midi);
  const lo = Math.min(...(midis.length ? midis : [60])) - 2;
  const hi = Math.max(...(midis.length ? midis : [72])) + 2;
  const rows = hi - lo + 1;
  const H = Math.max(120, rows * 14);
  const W = 1000;
  const totalBeats = Math.max(4, Math.ceil(beats / 4) * 4);
  const x = (b: number) => (b / totalBeats) * W;
  const y = (m: number) => ((hi - m) / rows) * H;
  const rowH = H / rows;
  const bars = Array.from({ length: totalBeats / 4 + 1 }, (_, i) => i * 4);
  const beatLines = Array.from({ length: totalBeats + 1 }, (_, i) => i);
  return (
    <svg class="roll" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Noten">
      {Array.from({ length: rows }, (_, i) => hi - i).filter((m) => [1, 3, 6, 8, 10].includes(m % 12)).map((m) => (
        <rect class="roll-black" x={0} y={y(m)} width={W} height={rowH} />
      ))}
      {beatLines.map((b) => <line class="roll-beat" x1={x(b)} x2={x(b)} y1={0} y2={H} />)}
      {bars.map((b) => <line class="roll-bar" x1={x(b)} x2={x(b)} y1={0} y2={H} />)}
      {notes.map((n) => (
        <rect class="roll-note" x={x(n.startBeat) + 1} y={y(n.midi) + 1} width={Math.max(2, x(n.beats) - 2)} height={rowH - 2} rx={3} />
      ))}
      {live && <rect class="roll-note live" x={x(live.startBeat) + 1} y={y(live.midi) + 1} width={Math.max(2, x(beats - live.startBeat) - 2)} height={rowH - 2} rx={3} />}
    </svg>
  );
}
