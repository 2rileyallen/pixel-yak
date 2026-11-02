# Story RPG

For games that tell a story through walkable places, scenes and battles, often adapting a story the user already loves. Most of this file is the process: a canon sheet first, then the structure, then scenes, then battles.

## This game
(Filled in at kickoff: the game in one sentence, and its 2–4 pillars — the things every feature is judged against.)

For an adaptation, also write the source here and how faithful the game is, for example: "events, order and outcomes kept; gameplay adds to the story but never changes it".

## The fantasy and core loop
The player lives a story: they walk its places, meet its people and fight the fights that matter in it. The loop:
1. Walk a place: a town to talk in, or an open area with visible enemies.
2. Reach a story beat: a scene or a conversation.
3. Fight the battle the story calls for.
4. Grow, and the next place opens. Visited places stay open to return to and find side content.

The story's big moments should become play, not cutscenes: map its power system and signature moments onto the genre's verbs. An invented example: a lighthouse keeper's daughter searching for her lost brother. Her knack for reading the weather becomes a battle mechanic that shows where the next wave will strike; his letters become pages that unlock new moves. A win the story earns by cleverness (talking her way onto a ship) can become a system: a trade, a contest, a puzzle.

The hero's defining trait should be how the player wins. If the hero is weak but knowing, telegraphs and counters should reward knowing the enemy.

## Pacing and progression
**The order of work.** The basics' order of cost (mechanics, structure, content, final art) becomes, for a story:
1. **Canon sheet** (an original story gets a story sheet). Who: the cast, how they relate, their quirks. What: the power system, key items, world rules. Where: the places. When: events in order, in arcs with chapter ranges. And what must stay true. Note sources and flag anything unsure or disputed. The user outranks the sheet because they know the story: let them correct it part by part as each is built.
2. **Mechanics mapping** (above), proven with a playable demo of one arc before the whole game is planned.
3. **Structure:** parts, then arcs, then beats. Split parts at natural breaks (a time skip, a new home), and let each part change how the hero plays. A short prologue with its own climax gets the player in fast.
4. **Content:** scenes, dialogue, enemies and places, as data.
5. **Final art**, most-seen first.

**Pacing.**
- Length follows the story plus its side content; don't pad for its own sake. Main story first, side content after.
- Side content should show who people are (a request that reveals a character's quirk), not send the player to fetch ten things.
- Ranks the story talks about can stay in the story: the hero's rank rises in a scene when the story says so, while the player's power comes from levels earned in fights.

## What the screen shows and explains
- **Dialogue:** short text boxes with expressive portraits. Faces and reactions live in the portrait, so sprites can stay simple; a wall of text gets skipped.
- **Ambient lines:** people speak as the player walks past, without stopping the game, so towns feel alive without forcing a conversation.
- **Big moments** play as scenes in the game's own engine. Parts that would be dull to play (a backstory, years passing) are shown, not played.
- **Tone:** a palette shift, a silence or an entrance card for a major foe carries more drama than extra words.
- **Battles serve the story.** Every fight should feel winnable. When the story says the hero loses, give the fight its own objective (survive, land a few hits, protect someone) instead of an unbeatable enemy. Many fights needn't be to the death: spars, contests, duels.
- **On the map:** visible enemies, no random encounters, because the player should choose their fights. A useful default: strike first for an advantage, get caught and the enemy has the edge, and a far weaker enemy is beaten on the map with no battle at all.

## Controls
Walking, talking and fighting share the same movement keys, so the hands never move between modes. One confirm key talks and advances text; text already seen can be skipped.

## What to build for its size
- **Toy:** one walkable room, one scene, one battle.
- **Demo:** one arc: a walkable area with level design that has intent (sightlines, a shortcut, a landmark, a secret), several scenes, several battles and a boss. Aim for 15–30 minutes of play, because a demo beaten in four minutes reads as too short and too easy.
- **Big:** the basics' scaffolding, shaped for a story. Each scene, conversation, enemy and place is its own data file; story progress is one set of flags. A check makes sure every scene's characters, places and flags exist. A test loads a save at each chapter's start and plays to its first beat.

## Do / Don't
Builds on **basics** (designs/game/basics): everything there applies unless this file says otherwise.
- Do sort a story dump three ways: canon facts (onto the sheet), decisions (only what the user calls a decision, in their words) and thoughts (everything else, discussed but never written down as rules), because logging a wish as canon or a musing as a rule puts words in the user's mouth.
- Do match the source when adapting: settings, costumes and abilities as the story describes them, because the user knows the story and will notice.
- Do write story text in your own words. When the story belongs to someone else, never paste its text into the game, keep reference pictures private (never shipped, never traced), and credit the original author.

## Lessons from games that used it
- A story-adaptation demo of one arc was praised for its mechanics but beaten in about four minutes. Its levels (walls, a stream, find the door) read as basic.
- Its battle screen (pause, then pick from a hand) was chosen because it matched a clever hero spotting the loophole.
- A long adaptation wrote the canon sheet first, flagged where sources disagreed for the user to settle, and filled gaps as each part was built. It turned the story's scripted losses into fights with objectives and kept the story's ranks off the stat screen.

## How to ask for a feature in this kind of game
A good ask names which part of the story (arc, chapter, scene), what must stay true, what's decided and what's still a thought, whether the moment is played or shown, and the tone.
- "Here's my story dump. Make a canon sheet first. Nothing is decided unless I say so."
- "Turn chapter 3, the storm at the lighthouse, into a scene list and one battle. She loses this fight in the story, so make it a survive-for-a-minute battle."

## Changelog
- 2026-11-02 · Seeded from a story-adaptation demo: its intent, design notes, canon sheet and playtest.
- 2026-11-02 · Seeded from a long story adaptation's direction and structure notes.
- 2026-11-02 · Seeded from cross-game lessons on the order of work and on story dumps.
