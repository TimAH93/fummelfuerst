# Fummelfürst

Adaptive guitar improvisation trainer: hear → understand → locate → play → harmonize → improvise.

## Status

- **Stage 1** – pure TypeScript music-theory and fretboard engine.
- **Stage 2** – exercise core: seeded RNG, exercise/attempt types, family registry,
  three families (note find, interval hunt, melody note → chord). Every family is
  checked over 1,000 seeds: its own solution must pass its own independent check,
  and every wrong answer must fail.

- **Stage 3** – voicing search (span ≤ 4, fingers ≤ 4 with a simple barre rule, string sets,
  inversions), a fourth family *triad build*, and the learner model: per-skill moving accuracy
  (α = 0.3), Leitner boxes 0–5, mastery = accuracy × confidence × tempo, weighted random
  selection, help levels 0–3 with hysteresis. Simulated players verify it targets weaknesses.
- **Curriculum** – training-mode style: per track an ordered path of small drills
  (12 fretboard, 42 interval, 32 triad, 14 melody). The app recommends one drill; the learner
  model only chooses inside it. A drill is passed once every skill is mastered and has held
  over a break; it comes back only if it clearly slips.
- **Keys → guitar** – a fifth track for a MIDI keyboard (e.g. FLkey 37) via Web MIDI
  (Chrome/Edge on desktop and Android; on-screen keys elsewhere): build the triad on the keys,
  it is checked as soon as the chord is held, then the reveal shows the same chord and
  inversion as a shape on three adjacent guitar strings.
- **Keyboard pairing** – the keyboard can stay on the PC (next to FL Studio): open the app
  in Chrome on the PC, "Keyboard koppeln" → PC, enter the 6-digit code shown on the tablet.
  The public PeerJS broker only introduces the devices; notes then go directly over WebRTC.
  The pairing is remembered and resumes after a reload. On Windows, if FL Studio holds the
  MIDI port exclusively, route FL's MIDI output to a loopMIDI port and let Chrome read that.
- **Neo-soul chords** – a sixth track: seventh and ninth chords (maj7 … m9, 9, 13, 7#9) played
  the way keyboard players voice them – root in the left hand, colour tones without the root in the
  right. Checked by function: guide tones (3rd, 7th) and colour (9, #9, 13) must be there, the plain
  fifth may be left out. The reveal shows a jazz guitar grip with the root in the bass.
- **"Was spiele ich?"** – jam screen for FLkey pad chords (the device itself does not name them):
  the held chord with each tone's role (Dbmaj9: Db 1 · F 3 · Ab 5 · C 7 · Eb 9), its function in
  the key (ii9 in Db major · "bereitet die V vor"; secondary dominants read as V7/iii), two or
  three chords that tend to come next with the reason in a few words, and a melody guide on the
  keyboard: 3rd and 7th as targets, extensions as colour, scale tones as safe passing notes, the
  avoid note ringed. A melody key played over the chord is named live ("Bb = 11 über Fm9:
  Durchgang"). The chord stays after the pad is released; the key is read from the chords played
  (sticky, so Db major / F minor loops do not flicker) or locked by hand.
- **Akkordfolge aufnehmen** – progression recorder: play the pads in order with FL's metronome
  running; each chord's length comes from the clock (snapped to 1 / 2 / 4 / 8 / 16 beats, tap a
  chord to cycle it). The result is a chord sheet with key and numerals, a MIDI file with the
  voicings as played (download, or "An PC senden" over the pairing so it lands next to FL Studio),
  text for the song file, or the chords go straight into the song brief. Repeats fold, melody keys
  on top are ignored, a chord built up slowly (Fm → Fm9) upgrades in place.
- **Pad-Karte** – what is on the FLkey's 16 User Chord pads (the device never names them), with the
  numeral in the key. Tap a pad for the recipe to store it: hold the pad, press the keys one at a
  time, "Octave –" first for a bass below C3. Fill a pad from the keyboard or type a chord symbol and
  take the suggested voicing (root C3–B3, right hand from C4, so no octave shifting is needed). The
  jam screen says "Pad 3" when it recognises one.
- **Arrangement** – planner from loop to song: sections as a timeline with bar numbers and the clock
  at the tempo (templates: Build-up & Drop, two drops, piano ballad, loop → song, pop, DnB), a big
  total length, and rules of thumb (nothing longer than 16 bars without a change, a build-up needs
  its drop, an outro, under a minute). The plan copies as text for the song file.
- **Song brief** – for getting from a loop to a song with a Claude "Song-Coach" project:
  type or record the loop's chords from the keyboard; the app detects the key (all 24 keys
  ranked; relative-key ambiguity is shown, borrowed chords like ♭VII flagged), adds tempo,
  parts, references and where you are stuck, and copies a plain-text brief to paste into Claude.
- **Listening core** (pulled forward for the tuner and mic checking): YIN pitch detection,
  tuner reading (nearest string, cents), and a note tracker that turns frames into
  played notes. Pure functions on sample buffers; the Web Audio layer comes with the UI.

- **Stage 4** – installable PWA (Vite + Preact) for tablet and phone: one-drill home screen,
  practice screen (play → reveal → self-rate, or tap chord chips), tuner via microphone.
  Progress stays on the device (IndexedDB). UI direction: [docs/ui-guidelines.md](docs/ui-guidelines.md).

```bash
npm install
npm run dev        # app on http://localhost:5173
npm run build      # static PWA in dist/
npm test           # Node's built-in runner via tsx
npm run typecheck
```

## What is here

```
src/app/             UI (Preact): screens/ Home · Practice · Tuner · ChordMonitor (jam) · Recorder · Pads · Arrangement · SongBrief · Link, components/, lib/
src/core/            pure TypeScript, no DOM – checked with lib ES2022 only
  theory/   pitch · spelling · interval · scale · chord · harmony
  guitar/   tuning · fretboard
  exercises/ rng · types · registry · attempt · families/{noteFind, intervalHunt, melodyChord}
  listen/   pitch (YIN) · tuner · tracker
  voicing/  voicing search · tabs · string sets
  mastery/  learner state · skill stats · help levels · selection
  curriculum/ tracks · drills · recommendation
  keys/     name held MIDI chords (type + inversion)
  song/     progression parsing · key detection · roman numerals · song brief
  index.ts  public API
tests/      theory · fretboard · exercises · voicing · mastery · curriculum · listen (.test.ts) · expect.ts (tiny assert helper)
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

## Learner model

```ts
import { buildCatalog, emptyState, nextExercise, applyAttempt, recordAttempt, createRng, getFamily } from './src/core';

const catalog = buildCatalog();               // every trainable skill + the focus that produces it
let state = emptyState();                      // plain JSON with schemaVersion, persisted later
const rng = createRng(sessionSeed);

const { exercise, helpLevel } = nextExercise(state, catalog, rng, { now: Date.now(), families: ['interval-hunt'] });
// … player answers …
state = applyAttempt(state, recordAttempt(exercise, response, meta), getFamily(exercise.family).tempo);
```

- **Selection:** family uniformly, then a skill with weight
  `weakness + due + novelty (+ small floor)`, ×0.1 if among the last 5. Random proportional, never argmax.
  New skills enter only while fewer than 8 per family are "in learning" (seen, box < 2).
- **Leitner:** right and quick *when due* → next box; early practice keeps the schedule;
  right but slow → stays (at least box 1); wrong → box 0.
- **Help levels** are kept per skill group (`interval:b3`, `triad:maj`, …): fade after 4 good answers
  in a row *and* group mastery ≥ 0.5 / 0.65 / 0.8; come back after 2 misses in a row.

## Curriculum

```ts
const curriculum = buildCurriculum(catalog);
const drill = recommendDrill(state, curriculum, 'intervals');   // 'Quinte aufwärts – Nachbarsaite'
const { exercise, helpLevel } = nextDrillExercise(state, drill, catalog, rng, Date.now());
// … answer …
state = markPassed(applyAttempt(state, attempt, tempo), curriculum, Date.now());
drillProgress(state, drill);   // { status: 'learning', progress: 0.62, comfortable: 2, total: 4 }
```

The order lives in `src/core/curriculum/curriculum.ts` as plain lists – edit there to reorder.
Interval drills group string pairs by hand shape: adjacent, adjacent across G/B, one string skipped.

## On the iPad / iPhone

The app is published from `main` to GitHub Pages by `.github/workflows/pages.yml`
(one-time: repository *Settings → Pages → Source: GitHub Actions*).

1. Open the Pages URL in **Safari**.
2. Share → **Zum Home-Bildschirm**. It then starts full-screen and works offline.
3. The tuner asks for the microphone once. Audio never leaves the device.

Progress lives in the browser storage of that device; iPad and iPhone keep separate progress.

## Song-Coach

`docs/song-coach/` holds the setup for a Claude project that coaches songwriting step by step:
project instructions, the studio overview (gear, software, FLkey 37 features) and one file per song.
