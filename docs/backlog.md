# Improvement backlog

The weekend improvement routine picks the top unchecked item it can finish in one run (or
something better it found), ships it, and ticks it here with the date and PR number.
Add new ideas at the bottom of the right section. Chris's decisions in CLAUDE.md win.

## Fixed
- [x] 2026-10-31: main was red. The Sumo playtest timed out because the normal bot won
      2-0 inside the 8 s real-time window, so the pause button it tried to tap was gone.
      The playtest now leaves a finished match through the result screen and records it
      as a warning instead of hanging.

## Feel and fairness
- [x] 2026-10-31: Sumo: the normal bot beat a mashing player 2-0 in under 8 s. Measured:
      the bot level made no difference; a masher fell off the ring *on their own* in about
      1.5 s of fight, even against an opponent standing still. Added rope saves: the rope
      catches a wrestler who dashes out without being pushed, 3 times a round (up to 6 with
      the handicap), shown as knots under the round pips with a "Saved by the rope!" pop.
      Pushes and Slippery Floor still put you out. Masher rounds now last ~4 s, matches
      ~13 s; bot-vs-bot balance unchanged.
- [x] 2026-10-31: Minigolf easy bot was too strong for a 6-year-old. Measured over 160
      holes: it averaged par (2.92 strokes vs par 2.875) with 22 holes-in-one, under par
      on most holes. Now it shakes more (aim 0.3, power 0.42), sees fewer lines (12 angles,
      3 powers) and often goes for one of its 3 best-looking lines rather than the best:
      +0.8 over par (3.67), 7 aces. Normal (-0.5) and hard unchanged. Unit test pins it.
- [x] 2026-10-31: Sea Battle seat bias was noise: 2000 mirrored games per level give
      player 1 49% (easy), 49% (normal), 50% (hard); first mover 49-52%. A unit test now
      pins seat balance. The sim found a real problem instead: the easy bot ignored its own
      radar contacts (it pinged "found!" and then fired anywhere), so an easy bot holding
      radar lost ~70% to one holding mine or airstrike. Every level now fires into a found
      box while hunting; easy radar vs mine/airstrike is now 45%/40% (was 31%/29%).
- [ ] Letterbox bars on tall phones: fill them with each game's own background so the
      phone looks full, or let games use a taller world.
- [ ] Haptics: short vibration on hits/goals where the browser supports it (Android).
- [ ] Each game's first-time "how to play" overlay showing the gesture with a ghost finger.

## App
- [ ] Rivalry card after a match night (shareable image, behind a parental gate).
- [ ] Family Wrapped prototype from the on-device match history.
- [ ] Daily minigolf course (seed from the date) with a "beat my score" link.
- [ ] Remove-ads / unlock-all screen mock (no real purchases yet); free trio badge.
- [ ] Settings: bot difficulty per game remembered; left-handed button mirroring.
- [ ] Accessibility: colour-blind safe player colours, larger text option.

## Content
- [ ] Mini pool (first update).
- [ ] More minigolf holes (target 18).
- [ ] More tank arenas, more Snack Snatch snack types.

## Ideas found 2026-10-31
- [ ] Sumo: a mashing player still never wins a round against any bot. A "first match"
      easy bot that waits a beat after GO! (or a slow-arrow assist knob) would let a
      toddler win sometimes.
- [ ] Playtest: per-game "self-out" counter (player lost without the other touching them)
      would catch the same trap in other games (Snake walls, Minigolf water).
- [ ] Minigolf: easy bot still sinks the 'bowl' hole in 1-2 often (2.35 avg on par 3); the
      bowl funnels any decent shot. Maybe a lip so speed matters.
- [ ] Bot pace table: a sim script printing every game's easy/normal/hard win rates and
      match lengths, so difficulty tuning across games has numbers (like this run's).
- [ ] Sea Battle: easy radar is still a bit weaker than airstrike (40/60 bot-vs-bot) because
      the sloppy easy bot spends more turns targeting, when it never radars. Fine for now;
      recheck if kids pick radar and lose.
- [ ] Power balance sim per game (each power vs each, mirrored seats, per bot level), like
      the Sea Battle one in this run, to catch powers a bot can't use.
- [ ] Playtest: Sea Battle's "vs-bot-later" screenshot is still the fleet-placement screen,
      so the real-time pass never fires a shot there. Teach it to tap Ready, then fire.
