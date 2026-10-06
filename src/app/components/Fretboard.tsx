import { useEffect, useState } from 'preact/hooks';
import { Tuning } from '../../core';
import { Board } from '../lib/prompts';

const MARKERS = [3, 5, 7, 9, 12, 15, 17, 19, 21];
/** Below this width the whole neck is unreadable; show a window around the dots instead. */
const NARROW = 700;
const WINDOW = 5;

function useNarrow(): boolean {
  const query = `(max-width: ${NARROW}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** Frets to draw: the full neck, or on narrow screens a 5-fret window around the dots. */
function fretWindow(board: Board, maxFret: number, narrow: boolean): [number, number] {
  if (!narrow || board.dots.length === 0) return [0, maxFret];
  const frets = board.dots.filter((d) => d.kind !== 'alt').map((d) => d.fret);
  const lo = Math.min(...frets);
  const hi = Math.max(...frets);
  const from = Math.max(0, Math.min(lo - 1, hi + 1 - WINDOW, maxFret - WINDOW));
  return [from, Math.min(maxFret, Math.max(hi + 1, from + WINDOW))];
}

/**
 * Tab-style fretboard: high E on top, nut on the left. Pure SVG, scales to its container.
 */
export function Fretboard({ tuning, maxFret, board, label }: { tuning: Tuning; maxFret: number; board: Board; label: string }) {
  const narrow = useNarrow();
  const [from, to] = fretWindow(board, maxFret, narrow);
  const n = tuning.strings.length;
  const fretW = 100;
  const gap = 46;
  const left = 70;
  const top = 34;
  const frets = to - from;
  const width = left + fretW * frets + 30;
  const height = top + gap * (n - 1) + 46;
  const y = (s: number) => top + gap * (n - 1 - s); // string 0 (low E) at the bottom
  const x = (f: number) => (f === 0 ? left - 34 : left + fretW * (f - from - 0.5));
  const emphasised = new Set(board.strings ?? []);
  const visible = board.dots.filter((d) => (d.fret === 0 && from === 0) || (d.fret > from && d.fret <= to));

  return (
    <svg class="fretboard" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {MARKERS.filter((m) => m > from && m <= to).map((m) => (
        <text class="fret-no" x={x(m)} y={height - 8} text-anchor="middle">{m}</text>
      ))}
      {Array.from({ length: frets + 1 }, (_, i) => (
        <line class={i === 0 && from === 0 ? 'nut' : 'fret'} x1={left + fretW * i} x2={left + fretW * i} y1={top - 8} y2={y(0) + 8} />
      ))}
      {tuning.strings.map((_, s) => (
        <line class={emphasised.has(s) ? 'string on' : 'string'} x1={left} x2={left + fretW * frets} y1={y(s)} y2={y(s)} />
      ))}
      {visible.map((d) => (
        <g class={`dot ${d.kind}`}>
          <circle cx={x(d.fret)} cy={y(d.string)} r={d.kind === 'alt' ? 15 : 20} />
          {d.label && d.kind !== 'alt' && (
            <text x={x(d.fret)} y={y(d.string) + 7} text-anchor="middle">{d.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}
