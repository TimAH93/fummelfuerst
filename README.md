# Fummelfürst

Adaptive guitar improvisation trainer: hear → understand → locate → play → harmonize → improvise.

## Status

- **Stage 1** – pure TypeScript music-theory and fretboard engine.
- **Stage 2** – exercise core: seeded RNG, exercise/attempt types, family registry,
  three families (note find, interval hunt, melody note → chord). Every family is
  checked over 1,000 seeds: its own solution must pass its own independent check,
  and every wrong answer must fail.

- **Listening core** (pulled forward for the tuner and mic checking): YIN pitch detection,
  tuner reading (nearest string, cents), and a note tracker that turns frames into
  played notes. Pure functions on sample buffers; the Web Audio layer comes with the UI.

No UI yet, no runtime dependencies. UI direction: [docs/ui-guidelines.md](docs/ui-guidelines.md) (draft).

```bash
npm install        # tsx, typescript, @types/node (dev only)
npm test           # Node's built-in runner via tsx
npm run typecheck
```

## What is here

```
src/core/
  theory/   pitch · spelling · interval · scale · chord · harmony
  guitar/   tuning · fretboard
  exercises/ rng · types · registry · attempt · families/{noteFind, intervalHunt, melodyChord}
  listen/   pitch (YIN) · tuner · tracker
  index.ts  public API
tests/      theory · fretboard · exercises · listen (.test.ts) · expect.ts (tiny assert helper)
```

Everything derives from interval formulas: scales and chords are a root plus degree
tokens (`'1 b3 5'`), spelling comes from letter-stepping, and diatonic chords are
*identified* from stacked thirds rather than looked up.

```ts
import { scale, diatonicChordsContaining, chordSymbol, degreeToString,
         STANDARD, nearestInterval } from './src/core';

diatonicChordsContaining(scale('A', 'naturalMinor'), 0 /* C */)
  .map(x => `${chordSymbol(x.chord.chord)}:${degreeToString(x.fn)}`);
// ['Am:b3', 'C:1', 'F:5']

nearestInterval(STANDARD, { string: 1, fret: 3 } /* C */, 4 /* M3 */)[0];
// { string: 2, fret: 2 }  — E on the D string
```

String index 0 is the low E; `stringLabel()` gives the guitarist's 6…1 numbering.
Adding a scale or chord type is one line in `scale.ts` / `chord.ts`.

## Exercises

```ts
import { generateExercise, evaluate, recordAttempt, describeExercise } from './src/core';

const ex = generateExercise('interval-hunt', 1234);           // same seed → same exercise
describeExercise(ex);  // 'minor 2nd (b2) up from E [string 3, fret 9] on string 2 → F'
evaluate(ex, { kind: 'positions', positions: [{ string: 4, fret: 6 }] }); // { correct: true, hits: 1, … }

// Pin part of the question (the learner model will use this to target weak skills):
generateExercise('melody-chord', 7, undefined, { mode: 'naturalMinor', tonic: 'A', scaleDegree: 3 });
```

- **Modes:** `tap` (checked automatically: fretboard positions or chord chips) and
  `play` (play on the guitar, reveal, self-rate `miss` / `found` / `instant`).
- **Skill ids** are hierarchical and use guitarist string numbers (6 = low E):
  `note:F#/string:5`, `interval:b3/up/strings:5-4`, `melody:minor/deg:3`.
- **Attempts** store family + seed, not the exercise; the seed regenerates it.
- **Fret span** = highest − lowest *fretted* fret + 1; open strings are free.
