# Action combat

For real-time games where the fun is in the hit: a hero fights bigger enemies up close, reads their wind-ups, dodges or parries, and lands blows that feel heavy. Fits side-view brawlers, top-down action and real-time arena fights.

## This game
(Filled in at kickoff: the game in one sentence, and its 2–4 pillars — the things every feature is judged against.)

## The fantasy and core loop
The player is a fighter who beats things bigger than them through timing. The fantasy is weight and control: a blow lands and the world reacts.

The loop is a few seconds long and repeats all fight:
1. **Read** the enemy's wind-up.
2. **Answer** it: step away, dodge through it, or parry at the right moment.
3. **Punish** the opening with your own attack.
4. **Feel** the impact, recover, and read the next one.

Heavy attacks are a choice, not a button. Holding an attack button charges it: tap for light, hold for heavy, hold longer for a third tier on some moves. The longer you hold, the more exposed you are, so the deeper skill is setting up: staggering or baiting an enemy (a feint, a dash that leaves an afterimage it attacks instead) to buy time to charge.

## Pacing and progression
- Regular enemies use wind-ups only. Named fighters and bosses add one more system each: a pressure that slows you until a parry or a landed hit breaks it, a signature big move, or a clash when both sides release a charge at once.
- Every fight should feel winnable. If the story says the hero loses, give the fight its own objective (survive a while, land a few hits, protect someone) instead of an unbeatable enemy.
- Growth should show in how the hero plays (a new move, a new charge tier, a faster dodge), because the player feels moves and barely notices bigger numbers.
- Effects fit the tone. A quiet, controlled story wants a quiet charge (stillness, a lowered blade, one glint per charge level), not a roaring flame aura and a shouting face.

## What the screen shows and explains
- **Telegraphs** live on the attacker's body: a wind-up pose held for a beat, a glint, a glow. Warn on the floor only for attacks the player couldn't otherwise see (from below, from off-screen). A regular tell needs time to react to: start near half a second and tune by playing.
- **Impact** on a heavy hit: hit-stop first (both fighters freeze; start near 4–6 frames at 60 steps a second, fewer for light hits), because the pause is what sells the weight. Then knockback, a short shake scaled to the hit, a shockwave ring, and dust and cracks when a body or a big weapon hits the floor. On the biggest blows, an impact frame: one or two frames of a stark, high-contrast picture of the hit.
- **Two-stage impact** reads bigger than one: a small contact spark, a beat of near-silence, then the large burst. The delay is the drama.
- **Damage numbers** on every hit, dealt and taken.
- **Invulnerability:** after a hit the player flashes and can't be hit for about a second, because two hits from one mistake feel unfair. A dodge gets a short window where hits pass through. Keep both short, so dodging stays a skill.
- **Colour:** keep environments muted, because the colour of power only reads against them.
- **Camera:** for a huge move the camera may pull back to show its size, then push in. Freeze the fight while it plays, and shorten it after the first time per move, because a cinematic that costs the player a hit is a punishment.

## Controls
- A small, fixed set of battle inputs, for example three attacks, a dash and a parry, because any more and the player looks at their hands. Attacks sit on the right hand (mouse buttons, J K L); Shift makes a good parry, a side mouse button a good dash.
- Every attack button can be held to charge. A button held while the hero is busy starts charging the moment they're free, because a dropped input feels like the game ignored you.
- In a browser, keep Ctrl off the combat keys: Ctrl+W closes the tab mid-fight.
- Pause also freezes hit-stop timers, shake, particles and enemy wind-ups.

## What to build for its size
- **Toy:** one hero, one enemy, one attack, a dodge, and a tuning panel for hit-stop, knockback and shake. Tune the feel before adding more.
- **Demo:** two or three enemy types, one named fighter or boss with its extra system, two or three arenas.
- **Big:** the basics' scaffolding, shaped for combat. Each move and each enemy is its own data file (wind-up, active and recovery frames, damage, knockback, hit-stop, which tell). Capture tests play scripted inputs headless and screenshot the charge, the parry and the big move. The busiest frame has a time budget.

## Do / Don't
Builds on **basics** (designs/game/basics): everything there applies unless this file says otherwise.
- Do make monsters much bigger than the hero (about one and a half times as tall, and burly), because size relationships carry the drama.
- Do draw fighters big enough for wind-ups and swings (roughly 40–64 px tall, real proportions, no big heads), because a 16 px fighter has no room to show a wind-up.
- Do stand side-view fighters in an open stance: the far foot leads and the near foot trails, so the chest opens to the player, never the back. In top-down or three-quarter views, fighters turn three-quarters toward the camera, so the action reads from where the player sits.
- Do give weapons a believable grip; a weapon in the near hand cuts across the body.
- Do spend the detail budget on fighters and their attack animations first; environments can stay simpler.
- Don't let shake, flashes or particles hide a silhouette or the next tell, because a fight you can't read is a fight you can't play.

## Lessons from games that used it
- A sword-fighting prototype's first hero read as bland and his charge looked like shouting. The fix: a four-frame cut with real wind-up and follow-through, and a quiet charge.
- The same prototype found small things that matter: the big-move zoom fires once per move, not every hit; a downed enemy's hit flash fades; shots in flight finish after the fight ends.
- Playtesters asked for heavy impact by name: hit-stop, knockback, shake, shockwave rings, dust and cracks, impact frames.

## How to ask for a feature in this kind of game
A good ask names the move or enemy, its tell and how long it lasts, what the player does about it (dodge, parry, outrange), roughly how hard it hits, and the feel ("slow and crushing", "quick and sneaky").
- "Add a brute twice the hero's height. Overhead slam: a one-second wind-up with the club raised, cracks where it lands, big knockback. Parryable, not blockable."
- "My heavy attack doesn't feel heavy. Try longer hit-stop and a two-stage impact, and put the numbers in the tuning panel."

## Changelog
- 2026-11-02 · Seeded from a sword-fighting battle prototype: its direction, art notes and log.
- 2026-11-02 · Seeded from a first real-time action game and its playtest.
- 2026-11-02 · Seeded from cross-game design lessons on combat feel, controls and fighter size.
