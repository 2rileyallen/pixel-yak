// clips/teaser.shot.js — the teaser's camera script (docs/contracts/CLIPS.md), run in the game page
// the moment filming starts. It plays the yak like a person would: → held all the way, Space when a
// rock or a gap is ahead (key events, read by the game's own input). At 5 s the game's own fade cuts
// to the last stretch below the summit, a minute and more into a good climb (14 of 16 tufts): a run
// handed to the play scene the way an F9 save is (sim.js saveRun/loadRun). Timing: window.__clip.t().
(() => {
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code }));
  const { level } = window.__yak;
  const GAP = 32767; // level.js: a column with no ground
  let hopUntil = 0, cut = false;
  key('keydown', 'ArrowRight');

  function lastStretch() {
    const x = 4450;
    const eaten = level.tufts.map((tuft, i) => i).filter((i) => level.tufts[i].x < x && i !== 5 && i !== 11);
    window.__yak.game.play({ save: { x, y: level.ground[x], ground: true, face: 1, tufts: eaten.length, eaten, check: level.cairns.length - 1, tick: 60 * 72 } });
  }

  const tick = () => {
    const t = window.__clip.t();
    const run = window.__yak.run();
    if (!cut && t >= 5) { cut = true; lastStretch(); }
    if (run && !run.done && run.tick > 10) {
      let gap = false;
      for (let d = 10; d < 17; d++) if (level.top[Math.round(run.x) + d] === GAP) gap = true;
      const blocked = run.vx === 0 && run.munch === 0;
      if (run.ground && !hopUntil && (gap || blocked)) { key('keydown', 'Space'); hopUntil = t + 0.4; }
    }
    if (hopUntil && t >= hopUntil) { key('keyup', 'Space'); hopUntil = 0; }
    if (t < window.__clip.length) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return { from: window.__yak.run().x };
})()
