# Grid battler

For battle games on a small grid of panels: each side owns its half, fighters step from panel to panel, and fights are won by reading the enemy's tells and picking the right move. Real-time or turn-based.

## This game
(Filled in at kickoff: the game in one sentence, and its 2–4 pillars — the things every feature is judged against.)

## The fantasy and core loop
The player is a fighter who outthinks stronger enemies on a tiny battlefield. Space is the main resource: the row you stand in decides what can hit you and what you can hit.

The minute-to-minute loop:
1. **Read.** An enemy shows its tell: a wind-up pose, a glow, a raised arm.
2. **Move.** Step out of its lane, or into the lane where your move will land.
3. **Commit.** Attack, block or use a special move, and live with its recovery time.
4. **Choose.** Every so often the player picks the next set of moves: a hand of cards, a loadout, a turn's actions.

The choosing step is the heart of the genre. In real time, a gauge that fills and then lets the player pause and pick from a small hand works best, because it creates the moment of spotting a loophole in the enemy's pattern and changing plan. A turn-based grid battler gets that moment every turn.

## Pacing and progression
- A regular battle lasts about 30–90 seconds and a boss a few minutes, because the genre strings many battles together and a long ordinary fight becomes a chore.
- The turn economy has two dials. In real time the gauge's fill time is the turn: shorter means more choices per fight, longer means each weighs more. Hand size is the other. Combining rules that let a clever pick take more cards give more choices than hard locks (only same-letter cards together).
- Prove one enemy before many, because a rule that's unclear with one enemy is chaos with three.
- When several enemies share the field, make them take turns or stagger their attacks, because three foes firing at once builds an undodgeable wall, and that feels unfair, not hard.
- Give enemies roles by position (rushers in front, snipers locked to the back column, teleporters who break the pattern), so a mixed group reads at a glance.
- Make variants from numbers (an elite: more health, a shorter tell, faster shots), because it's cheap and tests what the player already knows.
- Rewards feed the next fight. Beating an enemy can give the player one of its moves, which makes every new enemy worth beating. Passive upgrades sit outside the hand, so they don't crowd the choosing.
- Bosses are much bigger, have a few signature moves, change behaviour at half health and give a unique reward. End-of-fight grades work when the grade changes the reward.

## What the screen shows and explains
- The grid is the screen. Draw it straight-on with no slant, so lanes read as lanes. Each panel needs room for a whole fighter; at 320×180, panels about 40–48 px wide fit six to eight columns. A divider and a tint per side show who owns what.
- 3 rows × 6 columns (three by three per side) is compact and fast; 4 × 8 gives more room to dodge. Arenas can take their shape from the place (a two-row bridge, a rooftop with holes): same moves, new tactics.
- Telegraph with the enemy's body when the attack can be seen: a held wind-up pose, a charging glow, a flash in the eyes. Flash floor panels only for attacks the player couldn't otherwise see coming (from underground, an ambush), because warnings on every panel turn the grid into noise and teach players to watch the floor instead of the enemy.
- Damage numbers on every hit, dealt and taken, because on a tiny screen they confirm a move landed.
- When hit, the player flashes and can't be hit again for about a second, because two hits from one mistake feel unfair.
- The choosing screen shows each move as an icon and numbers; a "?" explains the combining rules.

## Controls
- Movement is one panel per press, because the grid is discrete and half-steps blur which lane you're in.
- Keep the battle buttons few and fixed (five works: three moves, a dash, a block), so the player never looks at their hands.
- On a controller, face buttons are the moves and the choosing screen works by d-pad alone.
- A key that opens a tool or menu must never interrupt or reset a fight.

## What to build for its size
- **Toy:** one hero, one enemy, one arena, two or three moves, win and lose.
- **Demo:** three to six enemy types, one boss, the choosing screen, rewards between battles, two or three arenas.
- **Big:** the basics' scaffolding, shaped for battles. Each move, enemy and arena is its own data file (damage, wind-up, recovery, which panels it hits). Fixture fights play headless from scripted inputs and check things like "the tell starts before the hit". The busiest moment (most shots on screen) has a time budget.

## Do / Don't
Builds on **basics** (designs/game/basics): everything there applies unless this file says otherwise.
- Do give every enemy attack a tell long enough to react to (start near half a second and tune by playing), because a hit you couldn't see coming teaches nothing.
- Do keep the whole grid in view during fights, because the player's map of the lanes lives in their head.
- Don't let effects cover the next tell, because a fight you can't read stops being tactics.

## Lessons from games that used it
- A real-time grid prototype first warned of an enemy's shot by flashing its row of floor panels. Playtest feedback moved the warning onto the enemy's body and kept floor warnings for hidden attacks: the rule above.
- The same prototype put four ways to pick moves behind one switch: a single slot with a preview, a stance flip, three cycling slots, and pause-and-pick. Pause-and-pick is the one later games chose.
- A story game's grid battles added a counter: hit an enemy during its wind-up to stun it and power up your next move, which rewards reading tells.

## How to ask for a feature in this kind of game
A good ask names where on the grid (rows, columns, lanes), the tell and how long it lasts, rough numbers or "stronger than X", how the player gets it, and how it should feel.
- "Add an enemy that stays in the back column and fires down my row. Its tell: its body glows for half a second. Make a normal and an elite version."
- "Add a move I earn by beating the boss: it hits the three panels in the column ahead, hard, with a slow wind-up that leaves me open."

## Changelog
- 2026-11-02 · Seeded from a real-time grid battler prototype: its intent, roadmap and playtest notes.
- 2026-11-02 · Seeded from two story games that used grid battles.
- 2026-11-02 · Seeded from cross-game design lessons on controls, telegraphs and feel.
