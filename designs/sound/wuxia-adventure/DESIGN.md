# Wuxia Adventure

Plucked zither, a breathy bamboo flute and a bowed two-string fiddle over slow pentatonic harmony in a long, misty hall. Calm pieces are sparse and slow; battles lean on big hand drums, a tight pluck pattern and the fiddle on top.

Its code twin is `instruments.js`; `example-song.js` shows it in use.

## The mood in a paragraph
Wistful and wide. A lot of air between the notes: a single flute line over a rolling pluck
arpeggio, a pad that just holds the chord, a gong or a woodblock now and then instead of a beat.
When it fights, it doesn't turn into rock music — it turns into drums: hand drums carry the
energy, the strings stay bright and short, the fiddle bends into its notes like a voice.

## Tempo and meter
- Calm pieces: 66–84 bpm. Battles: 140–160 bpm. Stingers (win / lose): 60–130 bpm, no loop.
- 4/4, 16 steps a bar (spb 4). Calm melodies move in quarter and half notes (ties `- - -`);
  the pluck arpeggio moves in eighths (a note every other step).

## Scales and modes
- Minor pentatonic for melodies (E: E G A B D) — it is what makes it sound like this. Leave the
  2nd and 6th out of the tune; let the harmony carry them.
- Harmony: natural minor chords (i – VI – VII – i, i – iv – v), a major V (B with D#) only at a
  turnaround.
- Darker scenes and bosses: Phrygian (the flat 2nd: D Eb …) on the bass and fiddle.

## Instruments
| Id | Role | What it's for here |
|---|---|---|
| `lead` = `flute` | lead | the main tune: breathy, scooped into each note, a slow vibrato that fades in |
| `keys` = `pluck` | keys | the rolling zither arpeggio under everything; long ring, a lot of hall |
| `pipa` | keys (fast) | the same string tight and bright, for battle patterns |
| `erhu` | second lead | the bowed fiddle: answers the flute in calm pieces, leads in battles |
| `bass` | bass | a soft plucked low string with a quick filter drop; only in battles |
| `pad` | pad | a reed-organ drone that holds each bar's root |
| `bell` | bell | temple bells for stingers and every menu sound |
| `drums` | drums | K big hand drum (k softer), S barrel drum, W/w woodblocks, G gong, C cymbal, h/o clapper ticks |

## Song form
- Sections of 4 bars; a song is two sections (A states, B answers) looped: 8 bars, ~25 s calm,
  ~13 s in battle.
- Calm: A = flute over the pluck; B = the fiddle takes the tune, the harmony moves away and comes
  home on the last bar.
- Battle: one 4-bar section that loops; the 4th bar ends in a snare fill (`S S S! S!`).
- Stingers: one section, `loop: false`, a held final note that rings out.

## Mix
- Leads 0.5–0.6, the pluck 0.4–0.5, pad 0.3–0.36, drums 0.45–0.7 (calm: ghosted `_` hits only).
- Echo is part of the sound: plucks 0.3, flute 0.38, pad 0.45, bells 0.4. Fast parts get less
  (pipa 0.12) or they blur.
- Aim for peaks around -5 dB in calm pieces and -2 dB in battles (`render-song` prints them).

## Effects language
- Bells for anything good or chosen: one bell for a cursor, two a fifth apart for confirm, a
  rising pentatonic run (A C E A) for a pickup.
- Steel and air for combat: a falling band of noise (4 kHz → 900 Hz, 0.18 s) for a blade, a low
  sine thump (220 → 90 Hz) under it for weight.
- The gong for anything that changes the scene (an encounter, a boss), with a noise swell that
  breathes in over 0.3 s.
- Woodblocks for small clicks; never a square-wave blip — it breaks the look.

## Do / Don't
- Do leave rests in calm melodies: the hall fills them, and the user hears the space as the mood.
- Do bend into long notes (the flute's and fiddle's scoop): it's the most recognisable gesture.
- Don't stack the flute and the fiddle in unison for long; they mask each other. Alternate.
- Don't put a backbeat under calm pieces; one gong or woodblock a bar is enough.
- Don't write melodies outside the pentatonic in calm pieces — one passing note at most.

## How to ask for a track in this sound
- "A calm town theme in this sound: 76 bpm, flute over the pluck, B section on the fiddle."
- "A battle loop like the example skirmish but in D Phrygian, heavier hand drums, gong on bar 1."
- "A two-bar victory stinger: rising bell run, a held pluck chord, no loop."

## Changelog
- 2026-11-02 — distilled from experiments in an earlier repo.
