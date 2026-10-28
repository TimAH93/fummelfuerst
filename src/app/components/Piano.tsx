import { pcToNote, toPc } from '../../core';
import { showNote } from '../lib/names';
import { NoteNames } from '../lib/store';

const BLACK = new Set([1, 3, 6, 8, 10]);

export type DotKind = 'target' | 'colour' | 'stable' | 'safe' | 'avoid';

export interface PianoMarks {
  held?: number[];
  right?: number[];
  wrong?: number[];
  /** Small markers on keys (melody guide): kind decides the look, label is a degree like '3' or 'b7'. */
  dots?: Record<number, { kind: DotKind; label?: string }>;
}

/**
 * Keyboard C3–C6 (the 37 keys of an FLkey 37). Tapping toggles a key when `onToggle` is set,
 * so the drill also works without a MIDI keyboard.
 */
export function Piano({ low = 48, high = 84, marks, onToggle, noteNames = 'international' }: { low?: number; high?: number; marks: PianoMarks; onToggle?: (m: number) => void; noteNames?: NoteNames }) {
  const whites: number[] = [];
  for (let m = low; m <= high; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const W = 40;
  const H = 180;
  const width = whites.length * W;
  const cls = (m: number) =>
    marks.wrong?.includes(m) ? 'wrong' : marks.right?.includes(m) ? 'right' : marks.held?.includes(m) ? 'held' : '';
  const whiteX = (m: number) => whites.indexOf(m) * W;
  const blacks: number[] = [];
  for (let m = low; m <= high; m++) if (BLACK.has(m % 12)) blacks.push(m);
  const blackX = (m: number) => whiteX(m - 1) + W * 0.68;
  const dots = Object.entries(marks.dots ?? {}).map(([k, d]) => ({ m: Number(k), ...d })).filter((d) => d.m >= low && d.m <= high);
  const dot = (m: number) => {
    const black = BLACK.has(m % 12);
    return { cx: black ? blackX(m) + W * 0.32 : whiteX(m) + W / 2, cy: black ? H * 0.6 - 20 : H - 44 };
  };

  return (
    <svg class="piano" viewBox={`0 0 ${width} ${H}`} role="group" aria-label="Klaviatur">
      {whites.map((m) => (
        <rect class={`key white ${cls(m)}`} x={whiteX(m) + 1} y={0} width={W - 2} height={H} rx={5}
          data-midi={m} onClick={onToggle && (() => onToggle(m))} />
      ))}
      {whites.map((m) => (
        <text class="key-label" x={whiteX(m) + W / 2} y={H - 12} text-anchor="middle">
          {showNote(pcToNote(toPc(m), 'flat'), noteNames)}{m % 12 === 0 ? Math.floor(m / 12) - 1 : ''}
        </text>
      ))}
      {blacks.map((m) => (
        <rect class={`key black ${cls(m)}`} x={blackX(m)} y={0} width={W * 0.64} height={H * 0.6} rx={4}
          data-midi={m} onClick={onToggle && (() => onToggle(m))} />
      ))}
      {blacks.map((m) => (
        <text class="key-label black-label" x={blackX(m) + W * 0.32} y={18} text-anchor="middle">{showNote(pcToNote(toPc(m), 'flat'), noteNames)}</text>
      ))}
      {dots.map((d) => {
        const { cx, cy } = dot(d.m);
        const r = d.kind === 'safe' ? 5 : 11;
        return (
          <g class={`dot ${d.kind}`} pointer-events="none">
            <circle cx={cx} cy={cy} r={r} />
            {d.label && d.kind !== 'safe' && <text x={cx} y={cy + 4} text-anchor="middle">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}
