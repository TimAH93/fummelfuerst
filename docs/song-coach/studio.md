# Mein Studio

Was ich zum Musikmachen habe, und was davon wofür taugt. Gedacht für mich, für Fummelfürst
und als Kontext für den Song-Coach (Claude-Projekt, siehe README.md in diesem Ordner).

## Ich

- Gitarre seit ~10 Jahren, immer wieder: Westerngitarre (aktuell keine E-Gitarre, auch keine geplant), früher drei E-Gitarren, vor allem Riffs.
- Möchte auch selbst singen.
- Notennamen und Musikbegriffe **englisch**: B (nicht H), Bb (nicht B), F minor, C major,
  natural/harmonic minor, minor pentatonic, root position, 1st inversion … Sonst Deutsch.
- Theorie-Unterricht gehabt: Skalen, Tonleitern, Noten. Nie in einer Band, noch nie einen Song fertig gemacht.
- DAW-Anfänger. Problem: Ich komme vom Loop nicht zum ganzen Song.
- Stil: offen, viele Richtungen. Der Coach leitet ihn aus Referenz-Songs ab.
  Gerade besonders: **Neo-Soul / jazzige Klavier-Harmonik** (Septakkorde, Nonen, Swing) und
  emotionale Klavierstücke; später Beats Richtung Kanye / J Dilla.

## Ziele

1. **Musik bauen:** eigene Ideen in FL Studio zu fertigen Songs machen – auch moderne Genres
   (Hyperpop, Build-up & Drop). Klavier ist Werkzeug zum Ideenfinden, kein Selbstzweck:
   keine Stücke nachspielen.
2. **Musik verstehen:** Theorie vom Hören zum Namen lernen (z. B. ii – V – I), so viel, wie der Track braucht.
3. **Live loopen:** mit dem FLkey ein Stück live schichten – Akkorde einspielen, Loop läuft weiter,
   Bass, Melodie, Drums drüber, mit den Reglern live arrangieren. Stufenleiter:
   1. Akkordfolge 4× ohne Stocken im Takt (Metronom)
   2. Akkorde aufnehmen, frei drüber improvisieren
   3. Akkorde → Bass → Melodie schichten, ohne Stopp (Loop Recording + Blend Notes, ein Kanal pro Instrument)
   4. Drums auf den Pads (FPC) dazu
   5. Live arrangieren mit den Reglern (Channel Volume): rein, raus, Pause, Drop

Zeit: mehr als 3–4 Sessions pro Woche möglich. Akkorde kommen über die User-Chord-Pads, nicht über
Fingersätze auf den Tasten. Lernprinzipien und Wochenrhythmus: [lernplan.md](lernplan.md).

## Fummelfürst-App (Tablet)

Eigene PWA, die mit dem FLkey (direkt per USB oder vom PC gekoppelt) mitliest. Werkzeuge, auf die
der Coach verweisen kann:

- **Session planen** – Plan mit Blöcken und Countdown (3 Beats · 1 Track fertig · Referenz + Track ·
  Impro + Beat · Kurz), Genre mit BPM, Elementen und Einschränkung, Themen-Rotation
  (Drums · Bass · Arrangement · Mix · Melodie), Exports pro Woche.
- **Was spiele ich?** – nennt den gehaltenen Akkord (auch Pad-Akkorde), seine Stufe in der Tonart
  (ii9 in Db major, V7/iii …), 2–3 Folgeakkorde mit Grund, und zeigt Zieltöne/Farbe/Durchgang für
  die Melodie auf der Klaviatur. Tonart automatisch oder festgelegt.
- **Aufnehmen** – Akkordfolge vom Keyboard als Chord-Sheet mit Längen; MIDI-Export (auch direkt an
  den PC), Text, oder in den Song-Steckbrief.
- **Summen** – Idee ins Tablet summen/pfeifen → Noten auf dem Raster, Tonart-Tipp, MIDI-Export.
- **Im Takt** – Click mit Vorzähler, jeder Pad-Wechsel wird gegen die Eins bewertet (±80 ms);
  4 saubere Loops in Folge = Live-Loop-Stufe 1.
- **Pads** – Karte der 16 User-Chord-Pads mit Anleitung zum Speichern (inkl. Octave –).
- **Arrangement** – Teile als Zeitleiste mit Takten und Uhrzeit bei BPM, Vorlagen, Faustregeln.
  **Referenz nachbauen**: Song läuft, Tempo tippen, bei jedem Teilwechsel tippen → Vorlage.
- **Song-Steckbrief** – Text für den Coach (Akkorde, Tonart, Stufen, Tempo, was fehlt).

## Software

| Was | Status | Wofür |
|---|---|---|
| FL Studio Producer Edition | gekauft (Image-Line) | DAW: Arrangieren, Audio-Aufnahme (Gitarre), Mixen |
| FLEX + Packs: Black Octopus Pandora, Saif Sameer Fulcrum, Liquid DnB | Image-Line-Konto | Synth-Presets, u. a. für Drum'n'Bass |
| Piano in Blue 3.0 (Cinesamples/Sonicsmiths) | NI-Konto: Full version, installiert (11,8 GB) | Steinway D von 1949 (Columbia 30th Street), 3 Mikrofon-Positionen, Band-/Direkt-Weg. Läuft im kostenlosen Kontakt Player |
| Guitar Rig 5 Factory Selection | NI-Konto: Full version (kostenlose Fassung) | Amp-Simulation – ohne E-Gitarre derzeit nur als Effekt für Gesang/Akustikgitarre interessant |
| Komplete Start (kostenlos) | NI-Konto, installiert: Kontakt 8 Player, Kontakt Factory Selection, TRK-01 Bass, Supercharger | TRK-01 Bass braucht **Reaktor 6 Player** (bei Bedarf nachinstallieren). Bewusst weggelassen: Guitar Rig 6, Play Series, Expansions, Komplete Kontrol, Reaktor-Extras |
| IL Coupon / Virtual Cash | Image-Line-Konto | Guthaben prüfen |

Installation: Programme auf C, Projekte/Samples/Libraries auf D (z. B. `D:\Musik\…`),
außer D ist die schnellere SSD.

**Werkzeugkiste bis zum ersten fertigen Song:** FL-Stock-Drums, FLEX, Piano in Blue,
Westerngitarre (übers Yeti X aufgenommen). Nur Presets – erst fertig machen, dann schrauben.

## Instrumente und Aufnahme

| Was | Wofür / Hinweis |
|---|---|
| Westerngitarre | Hauptinstrument. Aufnahme über das Yeti X |
| Blue Yeti X (USB-Kondensatormikrofon) | Gitarre, Bongos, Shaker und **Gesang** (will ich selbst ausprobieren) direkt in FL Studio. Für Gitarre: Niere, 20–30 cm vor Bund 12 |
| Bongos, Shaker | Echte Percussion statt nur Samples |
| Novation FLkey 37 | Siehe unten |
| M-Audio SP-2 Sustain-Pedal (Klavier-Form, neu) | Fürs Klavierspielen mit Piano in Blue. Vor dem USB-Kabel einstecken und beim Einstecken nicht treten – das FLkey erkennt die Polung selbst |

## Novation FLkey 37 (1. Generation, User Guide v4.0)

37 anschlagdynamische Tasten, 16 Pads (anschlagdynamisch, Aftertouch), 8 Drehregler,
Pitch/Mod-Rad, Sustain-Eingang, 5-Pol-MIDI-Out. Braucht FL Studio ≥ 20.9.2, wird automatisch erkannt.

**Für den Weg vom Loop zum Song am wichtigsten:**

| Funktion | Bedienung | Wozu |
|---|---|---|
| **Score Log** | Taste *Score Log* | Holt alles, was in den letzten 5 Min. gespielt wurde, ins ausgewählte Pattern – auch ohne Aufnahme |
| **Scale Chord Mode** | *Shift* + 5. Pad | Leitereigene Akkorde auf den Pads (Seiten: Dreiklänge/7er, 7er/9er, 9er/6-9), Tonart via *Shift + Scale* + Taste |
| **User Chord Mode** | *Shift* + 6. Pad | Bis 16 eigene Akkorde (je ≤ 6 Töne) auf Pads, bleibt nach dem Ausschalten gespeichert |
| **Fixed Chord** | *Fixed Chord* halten + Töne | Eine Akkordform auf jede Taste transponieren |
| **Scale Mode** | *Scale*; *Shift + Scale* zum Einstellen | Tasten spielen nur Skalentöne. 8 Skalen: Moll, Dur, Dorisch, Mixolydisch, Phrygisch, Harmonisch Moll, Moll- und Dur-Pentatonik |
| **Sequencer-Pads** | *Shift* + Sequencer-Pad | Drum-Steps direkt auf den Pads (16 Steps), Regler editieren Tonhöhe/Velocity/… pro Step |
| **Instrument-Pads** | *Shift* + Instrument-Pad | FPC-Drums, Slicex/Fruity Slicer auf den Pads |
| **Note Repeat** | *Note Repeat*, Rate über *Shift* | Hi-Hat-Rolls etc., folgt dem FL-Tempo; Tap Tempo |
| **Transport** | ▶ ■ ● | Play/Stop/Record in FL; Loop Record ist ab Werk an |
| **Quantise / Metronom / Undo / Redo** | eigene Tasten | Direkt am Keyboard |
| **Preset ▲▼** | | Presets von FL-Plugins durchblättern, ohne Maus |
| **Regler-Modi** | *Shift* + obere Pad-Reihe | Plugin-Parameter, Mixer-Lautstärke/Pan, Channel-Lautstärke/Pan, Custom |

**Technisches (für Fummelfürst):**
- Zwei USB-MIDI-Ports: **MIDI** (Tasten/Pads) und **DAW** (Script-Steuerung, unter Windows *MIDIIN2/MIDIOUT2*). Fummelfürst liest nur den MIDI-Port.
- MIDI-Kanäle ab Werk: Tasten **1**, Akkord-Pads **2**, Drums **10**. Fummelfürst ignoriert Kanal 10.
- Instrument-Pads chromatisch ab C5 (MIDI 84).
- Firmware-Updates und Custom Modes: components.novationmusic.com (Chrome).
- Software-Bundle und Novation Sound Collective: customer.novationmusic.com/register – noch prüfen, was dabei ist.

## Native Access

Nur zum Herunterladen, Aktivieren und Aktualisieren – muss nicht mit Windows starten.
Programme: `C:\Program Files\Native Instruments`; Inhalte (Samples) und Downloads auf D.
