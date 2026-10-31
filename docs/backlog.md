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
- [ ] Sumo: the normal bot beats a mashing player 2-0 in under 8 s. Rounds that short
      feel unfair to a small kid; consider a softer normal bot or a longer first round.
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
