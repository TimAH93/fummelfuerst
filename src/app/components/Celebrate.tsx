import { Rank } from '../../core';

/** One card when a milestone falls: the number, the rank, what changed. Then quiet again. */
export function Celebrate({ songs, rank, onClose }: { songs: number; rank: Rank; onClose: () => void }) {
  return (
    <div class="celebrate" role="dialog" aria-label="Meilenstein" data-testid="celebrate">
      <div class="celebrate-card">
        <div class="celebrate-notes" aria-hidden="true">{['♪', '♫', '♬', '♪', '♫'].map((n, i) => <span style={{ animationDelay: `${i * 0.15}s` }}>{n}</span>)}</div>
        <p class="eyebrow ok">Meilenstein</p>
        <div class="celebrate-number">{songs}</div>
        <div class="celebrate-what">Songs fertig</div>
        <h1 class="drill-title">{rank.emblem} {rank.name}</h1>
        <p class="meta">Neuer Rang: Farbe, Schrift und Wappen ändern sich ein wenig. Weiter so.</p>
        <button class="primary" onClick={onClose}>Weiter</button>
      </div>
    </div>
  );
}
