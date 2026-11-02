# Yak Trail — sound design

How Yak Trail sounds. Its code twin is `instruments.js`; the songs and effects are in
`game/sound.js`. Every distillation of the user's sound edits (skill sound-learn) makes this more
the game's own. Nobody has listened to it yet but the AI's numbers: this is a first draft.

## The mood in one paragraph
A small band on a mountain path: hopeful, unhurried, a little bit folk. A breathy wooden flute
carries a simple walking tune over a plucked dulcimer rolling in eighths, a soft plucked bass on
the first and third beat, a frame drum and a shaker that stay light, and now and then a yak bell
clanks on the downbeat. Nothing heroic until the top: the summit gets a short bright fanfare.

## Tempo and meter
- The climb: 104 bpm, the yak's trotting pace. The quiet arrangement: 92 bpm.
- The fanfare: 120 bpm, plays once.
- 4/4, 16 steps a bar. The tune moves in quarters and eighths; the dulcimer always in eighths.

## Scales and modes
- D major. The tune keeps to the pentatonic (D E F# A B) and lets the chords carry the rest; C#
  only on the way up into a phrase.
- Chords: D – G – D – A for the main phrase, B minor – G – D – A to lift, G – D – A – D to come home.

## Instruments
| Id | Role | What it's for here |
|---|---|---|
| `lead` | lead | the wooden flute: sine body, breath noise, scooped into each note, slow vibrato |
| `keys` | keys | the plucked dulcimer arpeggio under everything |
| `bass` | bass | a soft plucked low string, root and fifth |
| `pad` | pad | a reed organ holding the chord, only when the tune lifts (B, C) |
| `bell` | bell | cairns, the summit run, and the tune in the quiet arrangement |
| `drums` | drums | K frame drum · S hand slap on the rim (played soft, `S_`) · h shaker · o long shake · C small cymbal · **B the yak bell** |

## Song form
- `trail` — the climb (title and play): A B A C, 4 bars each, 16 bars ≈ 37 s, loops. The yak bell
  rings at the top of every A; C ends with a small rim fill back into the loop.
- `trail-quiet` — the same tune, the bell on the melody, no drums, 92 bpm. It is built from
  `trail`'s notes in code, so it follows any change to them (but not the user's Sound-view edits to
  `trail`). It exists for the F8 variant "Trail music" (A · folk band / B · quiet bells).
- `summit` — 3 bars, once: up the D chord, through G and A, a long D with the bell, the yak bell
  and the cymbal. Then silence under the finish panel.
- Paused: the music drops to 35% (`main.js`), and comes back on resume.

## Sound effects (one per sim event)
| Effect | Sound |
|---|---|
| `hop` | a light spring: a triangle swooping up 260 → 540 Hz |
| `land` | a soft hoof thud (a sine dropping 150 → 60 Hz) and a puff of dust |
| `munch` | three crunchy chews 0.13 s apart (a munch takes 0.4 s) |
| `checkpoint` | the yak bell and two bells going up a fourth |
| `fall` | a kind little "whoops" falling away, and a puff — a fall costs seconds, never the run |
| `summit` | a quick bell run up the scale, as the fanfare starts |

## Mix
- Tune 0.55, dulcimer 0.42, bass 0.55, pad 0.32, drums 0.5 (soft hits). The trail peaks about
  −1.5 dBFS at −16.6 dB RMS; the quiet arrangement about −3.5 / −21; the fanfare −1.7 / −18.
- Effects peak −6 to −11 dBFS: present over the music, never louder than it.
- Echo: flute 0.32, dulcimer 0.26, pad 0.42, bell 0.34, drums 0.18 — a valley, not a hall.

## Do / Don't
(rules learned from the user's edits land here, each citing the lessons behind it)

## Changelog
- 2026-11-02 — first sound: the trail theme, its quiet arrangement, the summit fanfare, six effects.
