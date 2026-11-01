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
- **Session planen** – the day's plan as deadlines: five plans (3 beats · finish one track ·
  reference + track · impro + beat · quick) with blocks in minutes and a one-line "done" each, a
  genre with tempo, elements and the one constraint that keeps it quick, and a topic that rotates
  through drums · bass · arrangement · mix · melody (the one that waited longest is suggested).
  A big countdown per block, three clicks when time is up, exports logged per session and
  counted per week on the home screen. Core: `song/session.ts`.
- **Reference map** (in Arrangement) – transcribe a form instead of a solo: tap the tempo while
  the reference plays, tap at every section change, and the taps become sections with bar counts
  (snapped to multiples of four when close) as the plan to build on. Core: `song/reference.ts`.
- **Lexikon** – chords worth knowing and the progressions behind whole genres (Neo-Soul/R&B,
  Lo-fi, House, Trap, Synthwave/Pop, Klassiker), written as roman numerals (`song/lexicon.ts`, with
  a small roman-numeral reader) and landed in the key of choice. Hear a chord or a progression on
  the tablet (`lib/synth.ts`, a small Web Audio e-piano), see it on the keys, keep it, put it on
  the pads, or save it as MIDI. The chord table grew: sus2, sus4, add9, m(add9), 6, m6, 6/9, m11,
  7sus4, 7♭9, maj7♯11, mMaj7 – recognised when played, too.
- **Dein Spiel** (habits, on the jam screen) – every chord recognised goes into a log; from it the
  most played chords, the recurring changes, the key and the lexicon genre the playing leans to,
  and nudges: a colour from that genre never played, a continuation after the most-played change
  not yet tried, a key to leave. CSV export for a database later. Core: `song/habits.ts`.
- **Folge üben** – progression trainer (`song/trainer.ts`): a progression (from the jam trail,
  the lexicon or the pads) at a slow click with a one-bar count-in, one bar per chord; the chord to
  play lies amber on the keys and turns green when hit, the next one is announced. A clean round
  adds 4 BPM up to the target; at the target, rhythm variations take over (Ganze, Halbe, Push,
  Viertel, Off-Beat, Arpeggio) and the last clean one finishes the exercise.
- **Gitarre** – the loop's chords as strummable grips (root in the bass, open position first,
  the fifth may go; the full colour falls back to the next simpler type and says so), a capo
  planner that picks the fret where the shapes are easiest (Dbmaj9 · C7#9 · Fm9 · Ebm9 · Ab13 →
  capo 1, C shapes), songbook chord boxes with degree labels, and the scale to play over the
  loop on the fretboard, frets counted from the capo, with a tapped chord's 3rd and 7th lit.
  Core: `guitar/capo.ts`.
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
- **Im Takt wechseln** – timing trainer, step 1 of the live-looping ladder: a Web Audio click with a
  one-bar count-in, every pad press judged against the bar line (genau within ±80 ms, früh / spät,
  daneben), hits, streak and mean offset, and "Stufe 1 geschafft" after four clean loops in a row.
  Onsets are the first key of a press, so legato pad changes count from the right moment.
- **Idee summen** – idea recorder: hum or whistle into the tablet (optional click with count-in); the
  monophonic tracker turns frames into notes with ends, the line is snapped to 16ths, shown on a
  small piano roll with a key guess, shifted by octaves if needed, and saved as MIDI (or sent to the
  paired PC). Pure parts: `listen/melody.ts` (tracker, quantiser, key guess, SMF writer).
- **Song brief** – for getting from a loop to a song with a Claude "Song-Coach" project:
  type or record the loop's chords from the keyboard; the app detects the key (all 24 keys
  ranked; relative-key ambiguity is shown, borrowed chords like ♭VII flagged), adds tempo,
  parts, references and where you are stuck, and copies a plain-text brief to paste into Claude.
- **Listening core** (pulled forward for the tuner and mic checking): YIN pitch detection,
  tuner reading (nearest string, cents), and a note tracker that turns frames into
  played notes. Pure functions on sample buffers; the Web Audio layer comes with the UI.

- **Learner model v2** – the per-skill EMA and Leitner boxes are replaced by a Beta lower bound
  over windowed, help-weighted evidence plus a half-life forgetting curve; transfer between related
  skills as a prior that never gates; diagnosed errors with partial credit and a "≈ Fast" rating;
  light play evidence from jamming and the trainers that can never pass a drill; a difficulty
  ladder inside drills, labelled reviews inside the normal session and a warm-up after a week
  away. Tuned against simulated learners (`npm run calibrate`); found-only players now pass,
  false passes on fretboard drop to 0. State v1 migrates on load, with a `learner.v1` backup.

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
src/app/             UI (Preact): screens/ Home · Practice · Tuner · ChordMonitor (jam) · Recorder · Pads · Arrangement · Timing · Hum · SongBrief · Link, components/, lib/
src/core/            pure TypeScript, no DOM – checked with lib ES2022 only
  theory/   pitch · spelling · interval · scale · chord · harmony
  guitar/   tuning · fretboard
  exercises/ rng · types · registry · attempt · families/{noteFind, intervalHunt, melodyChord}
  listen/   pitch (YIN) · tuner · tracker
  voicing/  voicing search · tabs · string sets
  mastery/  config · skill ids · relations · difficulty · belief · evidence · state + help · migration · play · selection
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
  `play` (play on the guitar, reveal, self-rate `miss` / `near` / `found` / `instant`:
  ✗ Daneben · ≈ Fast · Gefunden · ✓ Sofort, keys 1–4).
- **Skill ids** are hierarchical and use guitarist string numbers (6 = low E):
  `note:F#/string:5`, `interval:b3/up/strings:5-4`, `melody:minor/deg:3`.
- **Attempts** store family + seed, not the exercise; the seed regenerates it.
- **Fret span** = highest − lowest *fretted* fret + 1; open strings are free.

## Learner model

```ts
import { buildCatalog, emptyState, nextExercise, applyAttempt, recordAttempt, createRng, getFamily,
         knowledge, recall } from './src/core';

const catalog = buildCatalog();               // 285 leaf skills, each with its transfer edges and a difficulty
let state = emptyState();                      // plain JSON, schemaVersion 2
const rng = createRng(sessionSeed);

const { exercise, helpLevel } = nextExercise(state, catalog, rng, { now: Date.now(), families: ['interval-hunt'] });
// … player answers …
state = applyAttempt(state, recordAttempt(exercise, response, meta), getFamily(exercise.family).tempo);
knowledge(state.skills['interval:5/up/strings:6-5']);              // 0.556 after two clean answers at help ≥ 1, time-free
recall(state.skills['interval:5/up/strings:6-5'], Date.now());     // 1 now, 0.5 one half-life later
```

Every tunable is a field of `ModelConfig` (`src/core/mastery/config.ts`); every public model
function takes `cfg = DEFAULT_MODEL` last, so the simulation harness can sweep them. Only leaf
skills are stored – ancestors like `note` or `interval:b3/up` are computed on read.

- **Two numbers per skill.** *Knowledge* is the lower bound of a Beta belief, one standard
  deviation below the mean, over weighted success/failure counts `a`, `b` that are shrunk to a
  window of 20 (`nMax`, `nLapse`). It needs evidence, not luck: one clean answer gives 0.431, the
  comfort bar 0.75 is crossed at the 6th clean answer (7th with the board on screen); twenty answers
  at 90 % sit at 0.79, at 85 % at 0.74, at 80 % at 0.69. *Recall* is a forgetting curve
  `R = 2^(−Δt/hl)` measured from the last full success, with a half-life `hl` per skill.
- **One evidence shape** `{ x, w, f }` for quiz, aside and play (`evidenceOf`, `updateSkill`):

  | source | x | f | w |
  |---|---|---|---|
  | ✓ Sofort | 1 | 1 | `helpW[level]` = 0.9 / 1 / 1 / 1 for help 0…3 |
  | Gefunden | 1 | 0.5 | same |
  | ≈ Fast | 0.25 | 0 | same |
  | ✗ Daneben | 0 | 0 | same |
  | tap, right | 1 | by latency between the family's fast and slow time | same |
  | tap, wrong | the diagnosis' credit (0 / 0.25 / 0.5) | 0 | same |
  | aside (the skill a wrong answer built instead) | 1 | 0.5 | 0.5 × same |
  | play | 1 / 0 | clean / in time | ≤ 0.3, see below |

  **"Gefunden" is a success**: correctness and fluency are kept apart, so a player who always
  finds but never knows instantly passes exactly as fast; fluency (an EMA over correct answers)
  only adds a little practice to slow-but-right skills (`fluFloor` 0.75).
- **Half-life.** 10 minutes after the first success. A recall grows it by spacing:
  `hl × (1 + 2·w·(0.5 + 0.5·f)·min(3, gap/hl))`, so answered right one half-life later each time
  it walks 10 min → 30 min → 1.5 h → 4.5 h → 13.5 h → 1.7 d → 5.1 d, while 30 right answers one
  second apart move it from 10.0 to 10.9 minutes – cramming proves short-term memory. A miss
  shrinks it by how surprising it was: at 21 days, a miss with R = 1 leaves 4.2 d, R = 0.3 7.4 d,
  R = 0.05 9.0 d; nothing resets to zero.
- **Quiz-only counters.** `n` (attempts), `held` (successes ≥ 10 min after the previous quiz
  answer, `lastQ` – a jam or an aside in between is no break –, max 3, −1 per miss) and `lapses`
  (consecutive misses, max 3). Asides and play never touch them.
- **Gates read time-free knowledge, selection reads forgetting.** A skill is *comfortable* at
  `n ≥ 3`, `held ≥ 1` and knowledge ≥ 0.75; nothing un-passes by the calendar. Selection picks a
  family uniformly, then a skill with weight
  `1 × (1 − eff) + 0.8 × forgetPressure + 0.01`, where `eff` is the knowledge (with transfer)
  scaled by fluency and `forgetPressure` rises from 0 just after a recall to 1 at R ≤ 0.6;
  unseen skills weigh 0.6; ×0.5 if among the last 5 asked, ×3 while boosted by a confusion.
  Random proportional, never argmax.
- **Help levels** are kept per skill group (`interval:b3`, `triad:maj`, …) and fade full →
  name → sound + name → sound only: level 0 shows board, hint and names; 1 the names only; 2 plays
  the sound with the name; 3 plays the sound and shows the name at the reveal. Fade after 4 good
  answers in a row *and* group knowledge ≥ 0.6 / 0.75 / 0.85; back after 2 misses (a near miss
  counts half). Group knowledge is time-free, so help can fade at the start of a session.

### Transfer

Related skills give a cold skill a head start (`relations.ts`, computed from the parsed id and
the tuning, only between catalog ids):

| kind | between | strength |
|---|---|---|
| mirror | `interval:5/up/strings:6-5` ↔ `interval:5/down/strings:5-6` (all 132) | 0.8 |
| same-shape | same interval, same string distance, same fret offset (60 shape classes; G/B falls out) | 0.6 |
| octave-string | same note on strings 6 and 1 (identical frets) | 0.8 |
| same-pc | same note on another string, distance 1 / 2 / 3 / 4 | 0.3 / 0.45 / 0.2 / 0.2, ×0.7 across G/B |
| fret-neighbour | a semitone apart on the same string | 0.3 |
| degree-neighbour | same pair and direction, ±1 semitone (b3 ↔ 3) | 0.2 |
| same-gaps | the same triad on 6-5-4 and 5-4-3 (the only sets with equal gaps) | 0.6 |
| inversion-sibling | other inversion, same type and set (and on the keys) | 0.3 |
| keys-guitar | `keys:T/inv:k` ↔ `triad:T/inv:k/strings:*` | 0.3 |
| simpler-voicing | maj9 → maj7, m9 → m7, 9/13/7♯9 → 7 (and back) | 0.7 (0.4 back) |
| relative-key | `melody:major/deg:d` ↔ the minor degree with the same chord | 0.5 |

It is a **prior worth at most six answers** (`priorMax`), read one hop deep and never written
into the stored counts: a cold note whose octave twin sits at 19 right / 1 wrong starts at mean
0.81, low 0.68. **Gates never see it** – only selection, the ladder and the progress bar do.

### Errors

A wrong tap answer is diagnosed from the question and the response (`diagnose`, never from the
stored solution): note find `wrong-string` · `off-by-one` · `octave`; interval hunt `direction` ·
`octave` · `off-by-one` · `wrong-string`; triad build `wrong-set` · `span` · `inversion` ·
`missing-tone` · `wrong-type`; keys chord `inversion` · `extra-tone` · `missing-tone` · `wrong-type`;
neo-soul voicing `bass` · `missing-guide` · `missing-colour` · `wrong-tone`; melody → chord
`missed-chord` · `extra-chord`. A diagnosis carries partial **credit** for the asked skill
(0 / 0.25 / 0.5 – only the Beta sees the fraction; for the half-life, `held` and `lapses` a
wrong answer is a full miss), an **aside** for the skill actually built, only where the answer
would pass that skill's own check (an inversion 1 asked, inversion 0 played credits
`keys:maj/inv:0` at half weight; an unplayable grip or a tone outside the simpler chord credits
nothing) and a **boost** (×3 for 20 minutes)
on the confusable skills. Play-mode families get a fourth rating, **≈ Fast** (x 0.25, boosts the
semitone neighbours or the other two inversions). Practice shows one amber line under the verdict
in tap mode – "Richtige Töne, aber E im Bass: 1. Umkehrung", "Einen Bund zu hoch", "Der Farbton
fehlt: 9 = G" – and nothing in play mode. A tone outside the chord is named as the key that was
pressed: D over D♭ is "D (♯1)", not E𝄫 (♭2); C over C♯ is "C (♭8)", not H♯ (7).

### Play evidence

Jamming, the progression trainer and the timing trainer feed the model (`play.ts`, `applyPlay`):
a held chord maps to `keys:T/inv:i` (augmented at half weight) or to a complete `voicing:T`, else
to its simpler voicing, else to nothing.

| source | weight | quality f |
|---|---|---|
| jam, free | 0.1 | 0.7 |
| jam, the suggested next chord | 0.25 | 0.8 |
| trainer hit | 0.3 | 0.4 at 50 BPM … 1 at 90 BPM |
| trainer miss (the only play failure; only for a slot keys were played in) | 0.15 | – |
| timing trainer | 0.15 | genau 1 · früh/spät 0.6 · daneben 0.3 |

A success is discounted by `max(0.1, 1 − R)`: the same chord ten times in a minute is worth about
0.015 answers after the first, the same chord after a day 0.1 × 0.5. Misses do not compound: after
a play miss, further play misses of that skill count 0 until it is played or recalled again, so a
trainer left running cannot wear down what the quiz built. **A chord equal to a stored
pad counts 0** – it proves pad memory, not the skill (Practice still accepts it as an answer but
says "Pad erkannt – Töne bitte greifen").

| play may | play may not |
|---|---|
| raise `a` (so also the knowledge the comfort bar reads), fluency, half-life, last success (the skill stops being due) | touch `n`, `held`, `lapses`, `lastQ` |
| feed guitar triads through `keys-guitar` | change help, recent, boosts, warm-up |
| lift a drill's progress bar – its own skill's too, at most 0.25 before a quiz answer | pass a drill – comfort needs `n ≥ 3` quiz answers and `held ≥ 1`, a quiz success ≥ 10 min after the previous quiz answer – or un-pass one (slips count quiz misses) |

Four weeks of jamming alone take `keys:maj/inv:0` to knowledge 0.53–0.58 and pass no keys drill;
answers seconds apart after that pass nothing either. Play can carry the knowledge itself past the
bar – the picked C major ten times a day for two weeks reaches 0.76 –, but three quiz answers with a
break between two of them are still needed.

## Curriculum

```ts
const curriculum = buildCurriculum(catalog);
const drill = recommendDrill(state, curriculum, 'intervals');   // 'Quinte aufwärts – Nachbarsaite'
const plan = planSession(state, curriculum, drill, Date.now()); // recompute per pick
const { exercise, helpLevel, review } = nextSessionExercise(state, plan, rng, Date.now());
// review: the passed drill this pick came from – Practice shows 'Wiederholung · <title>'
// … answer …
state = markPassed(applyAttempt(state, attempt, tempo), curriculum, Date.now());
drillProgress(state, drill, Date.now());   // { status: 'learning', progress: 0.62, comfortable: 2, total: 4, recall: 0.81 }
```

The order lives in `src/core/curriculum/curriculum.ts` as plain lists – edit there to reorder.
Interval drills group string pairs by hand shape: adjacent, adjacent across G/B, one string skipped.
117 drills in six tracks (12 fretboard, 42 interval, 32 triad, 14 melody, 8 keys, 9 neo-soul);
67 of them train one skill, 6 seven and 6 twelve.

- **Unchanged rules.** One recommended drill per track in a fixed order, nothing skipped, "Du
  entscheidest". A drill is passed once every skill is comfortable – which includes having held
  over a break of ≥ 10 minutes between two quiz answers – and it comes back only when it clearly slips.
- **Ladder.** Inside a drill, unseen skills enter easiest first: ranked by difficulty
  (low frets before high, naturals before accidentals, adjacent strings before G/B and skips,
  root position before inversions) minus half of what transfer already suggests; only the two
  best-ranked unseen skills can be drawn (the second at 0.3), and only while fewer than four skills
  are in learning. 'Saite 6: Stammtöne' thus opens with E and F and climbs the neck
  (E F G A B C D); on 'Saite 1' the notes already known on string 6 come first.
- **Mixed session.** *Start* still trains the one recommended drill, but passed drills of the
  same track whose mean recall dropped below 90 % come back as labelled reviews: up to two
  review drills, 25–50 % of the picks (more the more is forgotten), never an unseen skill, never
  another track. Home says "· mit Wiederholung aus N Drills". Without reviews the random stream
  is identical to a single-drill session.
- **Warm-up.** After ≥ 7 days away the first five picks are reviews. The home card does not
  change after a holiday – predicted forgetting decides *what is reviewed*, never what is passed.
- **Slips are observed, not scheduled.** For the slip check a passed drill's skill counts 1 while
  comfortable, else 0.9 × 1 / 0.85 / 0.6 / 0.3 after 0 / 1 / 2 / 3 consecutive quiz misses – by
  the misses alone, not by how far above the bar it passed –, so a one-skill drill slips (below 0.5,
  the card turns to "Wiederholen") after exactly three misses in a row, a 7-skill drill when five
  of its skills have; one right answer clears a skill's lapses. The progress bar shows the share of
  the knowledge bar, multiplied down the same way, so it may dip below 0.5 after two misses on a
  drill that only just passed.

### Calibration

`tests/sim/` simulates learners with a different functional form than the model – a power-law
forgetting curve, its own learning rule, help bonuses and hidden transfer – so the fit is not
circular. **Prior knowledge is durable, new knowledge is not:** what a persona brings in (its
`k0`, or hidden transfer from a neighbour) keeps its own stability, starting at
`S0 · (S_PRIOR / S0)^k` with `S0` 20 minutes and `S_PRIOR` 60 days – the quick learner's 0.7
starts at 4.9 days and is still there the next morning – while what is learned in the app starts
at 20 minutes and has to be consolidated by spaced recall; recall is the knowledge-weighted mean
of the two. Personas: `quick` (knows 70 % of everything already), `steady` (25 %; 5 sessions a
week of 12–20 answers), `slow`, `stuck` (p = 0.5 forever), `foundOnly`, `optimist` (rates a
fifth of "found" as "instant"), `forgetful`, `returning` (a 14-day break), `gbWeak` (weak on G/B
intervals), `noodler` (30 jam chords a day, 70 % from pads). Metrics: time to pass, false passes
(true knowledge < 0.6 at the pass or a week later), retention 7 and 21 days after the pass,
over-/under-scheduling, weak-skill share, belief calibration, help by day, comeback slips and
warm-up picks.

```bash
npm run baseline     # the frozen v1 model (tests/sim/v1/) on every persona, 5 seeds, ~3 s → tests/sim/baseline-v1.json
npm run calibrate    # coordinate descent of DEFAULT_MODEL on seeds 11–15, then the v2 table on seeds 1–5
                     #   --passes=2 --budget=240 (s) --workers=4; --free also sweeps the test-pinned constants
```

The calibrator minimises `J = 3·falsePassRate + 2·underScheduled + overScheduled +
mean(|ttp − target|/target) + 2·calibration` (targets 10 / 35 / 55 / 90 answers for drills of
1 / 4 / 7 / 12 skills). The first run of 2026-11-01 took J from 3.858 to 2.841 in one pass and
moved `nLapse` 12 → 20, `helpW` [0.7, 0.85, 1, 1] → [0.9, 1, 1, 1], `learningDone` 0.6 → 0.5,
`maxLearningDrill` 2 → 4, the recent-pick damping 0.1 → 0.5 and `helpUp` → [0.6, 0.75, 0.85].
The re-run after the world made prior knowledge durable took J from 2.721 to 2.653 in two passes
and moved the weight floor 0.03 → 0.01 and `priorMax` 4 → 6 (`missShrink` went to 0.35 and back
to 0.2); a fresh run from there moves nothing. No transfer strength moved in either run.
**Principles are never tuned:** comfort 0.75, `n ≥ 3`, held after 10 minutes, slip below 0.5,
4 good answers to fade help, 2 misses to bring it back.

v1 (`tests/sim/baseline-v1.json`) against v2 (`DEFAULT_MODEL`), same personas, seeds 1–5
(first drill: seeds that passed it, median answers / sessions; rates pooled or averaged):

| persona · track · days | first drill v1 | first drill v2 | false passes v1 → v2 | retention 7 d / 21 d v1 → v2 | recall error v1 → v2 |
|---|---|---|---|---|---|
| quick · fretboard · 28 | 5/5, 74 / 5 | 5/5, 114 / 7 | 0 → 0 | 0.79 / 0.63 → 0.83 / 0.67 | 0.08 → 0.02 |
| steady · fretboard · 28 | 5/5, 129 / 8 | 3/5, 200 / 12 | 0 → 0 | 0.75 / 0.58 → 0.89 / 0.77 | 0.04 → 0.02 |
| steady · intervals · 28 | 5/5, 69 / 5 | 5/5, 126 / 8 | 78 % → 38 % | 0.51 / 0.34 → 0.59 / 0.43 | 0.27 → 0.06 |
| foundOnly · fretboard · 42 | **0/5** | 4/5, 245 / 15 | – → 0 | – → 0.94 / 0.85 | 0.00 → 0.02 |
| optimist · fretboard · 28 | 5/5, 132 / 8 | 3/5, 184 / 11 | 11 % → 0 | 0.71 / 0.54 → 0.88 / 0.74 | 0.05 → 0.01 |
| forgetful · fretboard · 28 | 5/5, 135 / 9 | 2/5, 283 / 18 | 25 % → 0 | 0.66 / 0.47 → 0.82 / 0.64 | 0.06 → 0.02 |
| gbWeak · intervals · 56 | 5/5, 69 / 5 | 5/5, 126 / 8 | 67 % → 23 % | 0.50 / 0.34 → 0.73 / 0.55 | 0.39 → 0.05 |
| noodler · keys · 28 | 5/5, 21 / 2 | 5/5, 35 / 3 | 58 % → 42 % | 0.61 / 0.45 → 0.61 / 0.45 | 0.07 → 0.04 |
| stuck · intervals · 56 | 0/5 | 0/5 | – | – | 0.01 → 0.04 |

Durable prior knowledge mostly moves the quick learner: while the world still forgot it overnight
like anything new, 'Saite 6: Stammtöne' took 96 / 6 under v1 and 187 / 12 under v2. The other
personas start with little and learn most of what they know in the app, so their numbers barely
move. What else moved: v1 never revisited a passed drill (under-scheduled 1.00 on intervals;
review share 0), v2 leaves no forgotten interval skill unasked for a week (0.00) and mixes in 6 %
reviews; on `gbWeak` the share of picks on weak skills rose from 0.65 to 4.14 times their share
of the pool. After a two-week break (`returning`, break after day 20 on intervals) nothing slips
and 24 of the 25 first picks back are reviews (in one seed both reviewed drills are back above
90 % recall after four); v1 had no warm-up. The price is speed: the lower-bound gate plus "held
over a break" costs 1.4–2.1 times v1's answers to a first pass, and for the steady learner knowledge
sits 0.22–0.23 from the true skill on average (v1's EMA: 0.17), because it is a lower bound by
design.

`tests/calibration.test.ts` (part of `npm test`) pins these as acceptance tests on seeds 1–5.
Where a first guess of the spec is feasible it is pinned or tightened – p = 0.5 passes no interval
drill in 100 days (877–1453 answers) and never gets past help level 1; no false pass on fretboard
for steady and quick, the optimist ≤ 10 %; steady fretboard retention ≥ 0.85 / 0.70, forgetful
≥ 0.75; recall error ≤ 0.08; under-scheduling ≤ 0.05; `gbWeak` ≥ 3 times its share; a comeback
slips nothing, opens with ≥ 4 review picks and leaves nothing to re-pass; jamming alone passes
nothing, nor do quiz answers seconds apart after it. Still infeasible under the principles, so the measured value is pinned with a margin and
the test says so (spec → pinned, measured):

- quick, 'fretboard/6/naturals': ≤ 70 answers / 3 sessions → ≤ 160 / 10 (91–138 / 6–8)
- steady, drills passed in 28 days: ≥ 4 fretboard / ≥ 3 intervals → ≥ 1 / ≥ 2 (medians 1 / 2)
- foundOnly, first fretboard drill: within 6 sessions → within 20 (11–17, 4 of 5 seeds in 42 days)
- steady intervals, false passes: 0 → ≤ 45 % (38 %, the one-skill G/B drills)
- steady intervals, retention: ≥ 0.70 / 0.50 → ≥ 0.55 / 0.40 (0.59 / 0.43)
- steady, |knowledge − k|: ≤ 0.20 → ≤ 0.25 (0.216 fretboard, 0.230 intervals)
- steady, over-scheduling: ≤ 0.30 → ≤ 0.50 (0.44 on both tracks)
- steady intervals, review share: ≥ 0.15 → ≥ 0.02 (0.062)
- quick, help: level ≥ 2 within 3 sessions → ≥ 1 after 6 (level 2 after 5–8 sessions)

### Schema

```ts
interface SkillStats {        // per leaf skill, schemaVersion 2
  a: number; b: number;       // windowed weighted successes / failures (direct evidence only)
  n: number;                  // quiz attempts
  flu: number;                // fluency 0..1, starts at 0.5
  hl: number;                 // half-life in ms
  last: number; lastOk: number; // last evidence of any kind / last full success (epoch ms)
  lastQ: number;              // last quiz answer: the break `held` counts is measured from here
  held: number; lapses: number;
}
// LearnerState: { schemaVersion: 2, skills, help, recent, passed, boost, lastActive, warmup }
```

`parseState` reads both versions: a v1 state (`acc`, `tempo`, `box`, …) is migrated by `migrateV1`
– ancestors dropped, `a`/`b` = accuracy × a window of `min(n, 20)` (for a skill v1 called
comfortable at least 14 answers at an accuracy of at least 0.9 – v1's gate let skills through from
about 0.76 –, so it stays comfortable and the home screen does not change on upgrade day),
half-life from the Leitner box (10 min, 1 d, 3 d, 7 d, 21 d), `held` = box − 1, `lastQ` = the last
v1 answer. Help levels are capped at 1 with fresh streaks: v1 showed levels 1–3 alike, and v2's 2
and 3 play the sound and hide the name, so they are earned again. Any other version throws; a v2
state from before `lastQ` reads it as `last`. In the app, `loadState` (`src/app/lib/store.ts`)
first – before parsing – copies the untouched string of any other version to the kv key
**`learner.v1`** (`learner.v${version}`; `learner.unreadable` when it is not JSON), once, never
overwritten, then saves the migrated state; a state it cannot parse falls back to an empty one,
and the backup keeps the only copy once the first save replaces it. `DB_VERSION` stays 1.
`exportAttempts()` returns every stored answer (Home: "Antworten exportieren" in the songs panel),
so the model can later be re-fitted against real answers instead of simulated ones.

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
