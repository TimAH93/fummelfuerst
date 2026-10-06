# UI guidelines (draft)

Status: **draft for review.** Sections marked *(decided)* come from the project brief;
everything marked *(proposal)* is a starting point to be confirmed or changed.

## Setting *(decided)*

- The phone sits on a music stand or the floor next to the player, roughly 1–1.5 m away.
- **The guitar is the main interface.** The phone shows the question, listens, and shows
  the answer. Touching it is the exception, not the loop.
- Dark, large, minimal. Readable from stand distance without leaning in.
- Help fades with skill: full help → name only → sound + name on request → sound only.
- Fingering diagrams and tabs appear on the fretboard screen and in the reveal,
  **never as a template before playing.**

## Type and contrast *(proposal)*

| Element | Size | Notes |
|---|---|---|
| Target (note, interval, chord) | ≥ 18 vw, at least 96 px | One per screen. The thing you read from 1.5 m. |
| Context line ("on string 5", "in A minor") | ~6 vw, at least 32 px | |
| Secondary text, labels | ≥ 20 px | Never needed while playing. |

- Background near-black (`#0b0b0c`), text off-white (`#ececec`); contrast ≥ 7:1.
- One accent for "right / in tune" (green) and one for "off / wrong" (amber, not red:
  readable for red-green colour blindness when paired with position or shape).
- Status never by colour alone: also position (needle left/right) or a symbol (✓ / ✗).
- Tabular figures for cents and fret numbers so they do not jitter.

## Layout *(proposal)*

- Portrait first, single column, nothing scrolls during an exercise.
- Big tap targets (≥ 64 px) in the lower third, reachable with one thumb.
- At most two actions visible: e.g. *reveal* and *next*. Self-rating after the reveal is
  three equally sized buttons: **missed / found / instant**.
- Screen stays awake while an exercise or the tuner runs (Wake Lock API).

## Motion and sound *(proposal)*

- No decorative animation. Transitions ≤ 150 ms; respect `prefers-reduced-motion`.
- Feedback when listening: a short, soft confirmation sound for "right" is optional and off
  by default, because the guitar is already making sound.

## Tuner *(proposal)*

- Shows: nearest string (big, guitarist numbering 6…1 plus note name), a horizontal needle
  ±50 cents, the cent value, and a clear "in tune" state at ±3 cents.
- Chromatic note shown smaller underneath, so alternative tunings and single notes work.
- Concert pitch A4 adjustable (default 440 Hz) in settings, not on the tuner screen.
- The needle is smoothed (median over a few frames) so it does not flicker.

## Listening / correction *(proposal)*

- Microphone is opt-in per session with a visible "listening" indicator.
- Single-note exercises (find the note, interval hunt, target note) can be checked by ear.
  **Limitation:** the mic hears pitch and octave, not the string; the same pitch on another
  string is accepted. The reveal still shows the intended position.
- Chords are not checked by ear in v0.1 (polyphonic detection is unreliable on phone mics);
  they stay tap / self-rated.
- If the room is too loud the app shows "can't hear you clearly" instead of guessing.
