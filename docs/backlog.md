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
- [ ] Minigolf easy bot: make it beatable by a 6-year-old (more aim/power noise).
- [ ] Sea Battle easy-vs-easy seat bias (~58% for player 1 in sims): find and fix.
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
