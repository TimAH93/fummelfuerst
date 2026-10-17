const BLACK = new Set([1, 3, 6, 8, 10]);

export interface PianoMarks {
  held?: number[];
  right?: number[];
  wrong?: number[];
}

/**
 * Keyboard C3–C6 (the 37 keys of an FLkey 37). Tapping toggles a key when `onToggle` is set,
 * so the drill also works without a MIDI keyboard.
 */
export function Piano({ low = 48, high = 84, marks, onToggle }: { low?: number; high?: number; marks: PianoMarks; onToggle?: (m: number) => void }) {
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

  return (
    <svg class="piano" viewBox={`0 0 ${width} ${H}`} role="group" aria-label="Klaviatur">
      {whites.map((m) => (
        <rect class={`key white ${cls(m)}`} x={whiteX(m) + 1} y={0} width={W - 2} height={H} rx={5}
          data-midi={m} onClick={onToggle && (() => onToggle(m))} />
      ))}
      {whites.filter((m) => m % 12 === 0).map((m) => (
        <text class="key-label" x={whiteX(m) + W / 2} y={H - 12} text-anchor="middle">C{Math.floor(m / 12) - 1}</text>
      ))}
      {blacks.map((m) => (
        <rect class={`key black ${cls(m)}`} x={whiteX(m - 1) + W * 0.68} y={0} width={W * 0.64} height={H * 0.6} rx={4}
          data-midi={m} onClick={onToggle && (() => onToggle(m))} />
      ))}
    </svg>
  );
}
