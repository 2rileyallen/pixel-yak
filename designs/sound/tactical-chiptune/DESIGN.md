# Tactical Chiptune

Handheld-console battle music: a wide detuned square lead, a slapping filtered bass in sixteenths and crisp 8-bit drums, fast and minor, built for grid fights that loop for minutes. A low-health twin brightens the lead and adds a heartbeat.

Its code twin is `instruments.js`; `example-song.js` holds a battle loop and its low-health twin.

## The mood in a paragraph
Urgent but heroic, never grim. The lead is a bright, chorused square that sings in short phrases;
the bass bounces under it in sixteenths with a filter "slap" on every note; the drums are tight
noise and a pitch-dropping kick. Everything is short and dry, so it stays readable at speed and
never tires over a long fight.

## Tempo and meter
- Battles: 140–160 bpm (bosses at the top). Menus and calm screens: 80–96 bpm.
- 4/4, 16 steps a bar (spb 4). Loops are 4 bars (64 steps): about 6.7 s at 144 bpm.
- The bass moves in sixteenths; the harmony in eighths; the lead mixes eighths with held notes.

## Scales and modes
- Natural minor (Aeolian) for battles, i – VI – iv – V with a major V (E with G#) to pull back home.
- Bosses: Phrygian dominant (D Eb F# G A Bb C) — the raised 3rd over the flat 2nd sounds menacing.
- Calm screens: a Japanese-flavoured pentatonic (E F A B D) on the flute and chime.

## Instruments
| Id | Role | What it's for here |
|---|---|---|
| `lead` | lead | two squares 7 cents apart (the chorus), lowpass at 2.5 kHz, short release |
| `lead_hot` | lead, low health | the same plus an octave triangle, brighter and more resonant |
| `keys` | keys | the harmony line: the lead's voice, shorter, quieter |
| `bass` | bass | saw + sub-octave triangle, the filter snaps down in 60 ms: the "slap" |
| `bass_hot` | bass, low health | the filter stays a little more open |
| `pad` | pad | a soft pulse + triangle for calm screens only |
| `bell` | bell | turn starts, level ups, menu confirms |
| `flute`, `chime` | calm screens | a breathy triangle flute and a soft FM chime |
| `drums` | drums | K kick, B boss kick, S snare (s darker), h closed hat, o open hat, C crash, t tick, H/J heartbeat |

## Song form
- One 4-bar section that loops; bar 4 ends in a fill (kicks and snares, open hats on the last two
  steps) so the loop point feels like a phrase, not a cut.
- Every battle song has a low-health twin with the same section and the same notes: swap
  `lead`→`lead_hot`, `bass`→`bass_hot`, open the hats, add a `heart` track (`H . J .` on the first
  steps of every bar). The game switches at the same step so the groove never stops.
- Bosses: two sections (A, B), the B section with the boss kick `B` and snare rolls.

## Mix
- Lead 0.45, harmony 0.3, bass 0.5, drums 0.55, heartbeat 0.45. The bass and the kick share the
  low end: if the mix gets muddy, lower the bass before the kick.
- Almost no echo (0.02–0.12): the sound is dry and close, like a small speaker.
- Aim for peaks around -2 dB and an RMS near -18 dB.

## Effects language
- Square blips for the interface: a 30 ms tone for the cursor (1.76 kHz), two rising tones a
  fifth apart for confirm.
- Noise cracks for hits (lowpass 3 kHz → 500 Hz, 0.12 s) over a falling square for weight.
- Bell arpeggios (major, fast: 45 ms apart) for good news — the turn starting, a level up.
- Keep every effect under 0.5 s except stingers: the music is busy and fast.

## Do / Don't
- Do keep phrases short (2 bars) and repeat them with a change; players hear them a hundred times.
- Do write the low-health variant as a mix change, not new notes — the player must feel it's the
  same fight getting worse.
- Don't use long echo or pads in battles; they smear the sixteenth-note bass.
- Don't put the lead below C4; the squares turn into buzz and fight the bass.

## How to ask for a track in this sound
- "A battle loop in this sound at 150 bpm, E minor, with its low-health twin."
- "A boss theme: Phrygian dominant, two sections, boss kicks in the B section."
- "A calm workshop theme at 84 bpm: flute and chime, a tick every beat, no bass."

## Changelog
- 2026-11-02 — distilled from experiments in an earlier repo.
