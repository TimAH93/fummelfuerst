# FL-Studio-Spickzettel

Die Handgriffe, die bisher gebremst haben. Nur das, was wir wirklich gebraucht haben.

## Fenster

| Taste | Fenster |
|---|---|
| F5 | Playlist |
| F6 | Channel Rack |
| F7 | Piano Roll |
| F9 | Mixer |
| Alt + F8 | Browser (Packs, Presets, Samples) |
| Ctrl + M | Metronom an/aus |

## Oben in der Transportleiste

- **PAT / SONG**: PAT spielt nur das aktuelle Pattern, SONG die Playlist. Spielt etwas Falsches, steht es meist hier.
- **Aufnahme-Optionen** (Rechtsklick auf den Record-Knopf): *Blend recording notes* an (sonst wird überschrieben), *Loop recording* an zum Schichten, *Countdown* an.

## Channel Rack

- **Sound tauschen:** Rechtsklick auf den Channel-Namen → **Replace** → FLEX / Sampler / FPC. Ein Sample nur auf den Namen zu ziehen ändert bei einem FLEX-Channel nur den Namen.
- **Sample in Sampler laden:** Rechtsklick → Replace → Sampler, dann das Sample aus dem Browser ins Sampler-Fenster ziehen.
- **Lautstärke pro Instrument:** der Drehregler links neben dem Namen. Akkorde eher 60–70 %, Melodie 100 %.
- **Solo:** Rechtsklick auf das grüne Lämpchen.
- **Neuer Channel:** „+“ unten.

## Piano Roll

- **Alle Noten:** Ctrl + A. **Löschen:** Entf.
- **Velocity aller markierten Noten:** Alt + X (Tools → Scale levels), oder unten im Velocity-Feld mit rechter Maustaste eine Linie ziehen.
- **Octave-Namen:** FL nennt das mittlere C **C5**. Das FLkey-Display nennt es C3. Gleiche Taste.
- **MIDI-Datei in ein Pattern:** Datei auf die Piano Roll ziehen (ein Channel) oder **File → Import → MIDI file** (ein Channel pro Track, Instrumente danach per Replace tauschen).

## FLkey

- **Score Log:** Tools → Macros → *Dump score log to selected pattern* holt die letzten 5 Minuten Spielen in ein Pattern – auch ohne Aufnahme.
- **User Chord speichern:** Shift + Pad-Mode-Taste für User Chord Mode, Pad halten, Tasten nacheinander drücken, Pad loslassen. Bass unter C3: Pad halten, **Octave –** drücken, Taste, Octave + zurück. Pad löschen: Preset ▼ + Pad.
- **Scale Mode:** Shift + Scale halten, Grundton drücken, Pad 1 Minor / 2 Major / 7 Minor Pentatonic, Scale einschalten.
- **Pot Mode „Plugin“:** die 8 Regler steuern FLEX-Macros.

## Gitarre loopen (Yeti X)

1. **Eingang:** Options → Audio Settings → Device *FL Studio ASIO*; Input = Yeti X.
2. **Mixer (F9):** einen Insert wählen, oben rechts bei **IN** den Yeti-Kanal wählen, das **Disk-Symbol** (Arm) einschalten.
3. **Loop-Bereich:** in der Playlist mit Ctrl + Ziehen z. B. 4 oder 8 Takte markieren. Metronom an.
4. **Aufnehmen:** Record-Knopf (Rechtsklick: *Audio* an, *Loop recording* an), Play, einmal die Akkorde durchspielen, Stopp. Der Audio-Clip liegt in der Playlist.
5. **Drüberspielen:** Loop läuft (SONG, Loop-Bereich), Gitarre bleibt im Mixer hörbar. App „Gitarre“ zeigt Griffe, Capo und die Scale.

Capo: Griffe und Bünde in der App sind **ab Capo** gezählt. Capo auf Bund 1 + C-Formen = die Db-Akkorde.

## Fertig machen

- **Export:** File → Export → **MP3 file** (Ctrl + R). Playlist-Ende mit dem Song-Ende abgleichen.
- **Loop-Markierung in der Playlist:** Ctrl + Ziehen in der Zeitleiste; Abspielen springt dann im Bereich.
- **Leeres Pattern „Jam“**: zum Jammen nur mit Metronom, damit keine Noten mitlaufen.
