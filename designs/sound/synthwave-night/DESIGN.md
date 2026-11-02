# Synthwave Night

A rainy city after dark: a pumping saw bass with a filter pluck, a square arpeggio in sixteenths, wide detuned-saw minor chords and a gated snare — with rain and neon hum underneath. Steady, cool, a little lonely.

Its code twin is `instruments.js`; `example-song.js` holds a night-drive loop.

## The mood in a paragraph
Nostalgic and cool rather than happy or tense. The groove never stops: the bass pumps in eighths,
the arpeggio ticks along, the pads breathe in slowly and hang. A lead, when there is one, is a
singing detuned saw with slow vibrato that slides into its notes. Under all of it, the city —
rain and a mains hum — so silence never sounds empty.

## Tempo and meter
- 96–118 bpm (112 is home). Indoor / quiet scenes drop to 84–96.
- 4/4, 16 steps a bar (spb 4). Arps in sixteenths, bass in eighths (root, octave, root, octave).

## Scales and modes
- Minor keys, mostly Aeolian and Dorian (D: D E F G A B C — the raised 6th sounds hopeful).
- Progressions that drift rather than resolve: i – VI – III – VII (Dm – Bb – F – C) or i – VI – iv.
- Pads play full triads as chords (`D3+F3+A3`); the arp spells the same chord upward.

## Instruments
| Id | Role | What it's for here |
|---|---|---|
| `lead` | lead | a detuned saw pair with a slide into each note and slow vibrato; lots of echo |
| `keys` | keys | a soft electric piano (FM, ratio 1) for chord stabs in quiet scenes |
| `bass` | bass | saw + sub, a resonant filter that snaps shut: the pumping pluck |
| `pad` | pad | two saws 14 cents apart, slow attack and release, big echo; play chords |
| `arp` | arpeggio | a short square, panned a little right, for sixteenth-note chord runs |
| `bell` | bell | glassy FM bells: door chimes, notifications |
| `drums` | drums | K soft kick, S snare in a big room, h/o hats, C long crash, P clap |
| `city` | ambience | R rain, N neon hum, W wind — long beds for their own track |

## Song form
- 4-bar sections; A is the groove (bass, arp, pads, drums), B adds the lead. A song loops A B:
  8 bars, about 17 s at 112 bpm.
- The city track strikes `R+N` every two bars (each bed lasts ~4.5 s and overlaps the next).
- Scene changes (outside → inside) are best made by switching to a song with fewer parts — drop
  the drums and the arp, keep the pads and the city.

## Mix
- Bass 0.46, arp 0.2–0.27, pads 0.3–0.34, lead 0.42, drums 0.48, city 0.42.
- Echo is wide on pads (0.55), the lead (0.42) and the snare (0.6); the bass stays dry (0.04)
  so the low end is tight.
- Aim for peaks around -2 dB, an RMS near -20 dB: this sound wants headroom.

## Effects language
- Glassy bells two notes apart (a fifth, 0.12 s) for doors and messages, with a breath of
  street noise under them.
- The arp voice for interface blips — one short square note.
- Wet footsteps: a sine falling 320 → 80 Hz with a little band of noise.
- Neon buzz: short saw bursts at 120 Hz through a low filter, then a 60 Hz hum.

## Do / Don't
- Do keep the bass and arp locked to the grid; the pads and lead are where the feeling lives.
- Do play pads as chords and let them ring past the bar line (long release).
- Don't use bright, fast leads or busy drum fills; the music is cruising, not racing.
- Don't drop the city ambience to silence between songs — fade it, the world keeps going.

## How to ask for a track in this sound
- "A night-drive loop at 112 bpm in A minor, groove first, the lead only in B."
- "A quiet indoor version of the drive theme: pads, keys and rain only, 90 bpm."
- "A rooftop theme: Dorian, slower pads, the lead an octave higher, wind instead of rain."

## Changelog
- 2026-11-02 — distilled from experiments in an earlier repo.
