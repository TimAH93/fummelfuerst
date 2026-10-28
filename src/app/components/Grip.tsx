import { Frets } from '../../core';

/**
 * Songbook-style chord box: strings left (low) to right (high), frets top to bottom, a thick nut
 * when the box starts at the nut, otherwise the first fret number. Degree labels in the dots.
 */
export function Grip({ frets, labels, title }: { frets: Frets; labels?: (string | null)[]; title?: string }) {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const lowest = fretted.length ? Math.min(...fretted) : 1;
  const highest = fretted.length ? Math.max(...fretted) : 1;
  const base = highest <= 4 ? 1 : lowest;
  const rows = Math.max(4, highest - base + 1);
  const n = frets.length;
  const W = 24;
  const H = 28;
  const left = 22;
  const top = 30;
  const width = left + W * (n - 1) + 22;
  const height = top + H * rows + 10;
  const x = (s: number) => left + W * s;
  const y = (f: number) => top + H * (f - base + 0.5);
  return (
    <svg class="grip" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title ?? 'Griff'}>
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line class={i === 0 && base === 1 ? 'grip-nut' : 'grip-fret'} x1={x(0)} x2={x(n - 1)} y1={top + H * i} y2={top + H * i} />
      ))}
      {frets.map((_, s) => <line class="grip-string" x1={x(s)} x2={x(s)} y1={top} y2={top + H * rows} />)}
      {base > 1 && <text class="grip-base" x={x(0) - 8} y={y(base) + 5} text-anchor="end">{base}</text>}
      {frets.map((f, s) => {
        if (f === null) return <text class="grip-mark" x={x(s)} y={top - 10} text-anchor="middle">×</text>;
        if (f === 0) return <circle class="grip-open" cx={x(s)} cy={top - 13} r={6} />;
        return (
          <g>
            <circle class="grip-dot" cx={x(s)} cy={y(f)} r={10} />
            {labels?.[s] && <text class="grip-label" x={x(s)} y={y(f) + 4} text-anchor="middle">{labels[s]}</text>}
          </g>
        );
      })}
      {frets.map((f, s) => (f === 0 && labels?.[s] ? <text class="grip-openlabel" x={x(s)} y={top + H * rows + 9} text-anchor="middle">{labels[s]}</text> : null))}
    </svg>
  );
}
