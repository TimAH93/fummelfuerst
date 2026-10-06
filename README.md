# Fummelfürst

Adaptive guitar improvisation trainer: hear → understand → locate → play → harmonize → improvise.

## Stage 1

Pure TypeScript music-theory and fretboard engine. No UI yet, no runtime dependencies.

```bash
npm install        # tsx, typescript, @types/node (dev only)
npm test           # 38 tests, Node's built-in runner
npm run typecheck
```

## What is here

```
src/core/
  theory/   pitch · spelling · interval · scale · chord · harmony
  guitar/   tuning · fretboard
  index.ts  public API
tests/      theory.test.ts · fretboard.test.ts · expect.ts (tiny assert helper)
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
