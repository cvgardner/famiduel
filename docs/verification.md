# Verification

`npm run verify` is the merge gate (GitHub Actions does not run on this account). It runs,
in order, and stops at the first failure:

1. `npm run typecheck`
2. `npm test` — rules and bots for every game (vitest, Node, fast)
3. `npm run build` — the single-file web build
4. `npm run test:e2e` — the app in Chromium at phone and desktop size: menus, player cards,
   the power-pick intro, and every game played bot-vs-bot to the result screen
5. `npm run playtest` — **plays like a person**. For every built game it:
   - checks the home screen doesn't scroll sideways at 320 px and that every intro screen
     fits a 360×640 and a 320×568 phone (fails if anything is cut off);
   - checks every visible button and toggle on home, the player sheet, two intros, play,
     pause and result is at least 44×44 CSS px on a 320×568 phone (fails otherwise; small
     kids miss small targets);
   - taps through the intro (picks a power, taps Ready) like a player would;
   - plays one person vs a bot in real time with touch gestures (taps, holds, drags,
     swipes) in the bottom half, then two people at once in both halves;
   - hands both seats to bots and checks the match reaches the result screen;
   - fails on any page error or console error; warns on a frozen screen or < 40 fps.
   - (`playtest/powers.spec.ts`) opens each game's intro on enough weeks of the power
     rotation to show every power in its pool once, at 320×568 and 360×640, with and
     without Bigger text, and fails if a card is cut off;
   It writes `playtest-report/index.html` (screenshots of every step for every game) and
   `playtest-report/summary.json`. **Look at the screenshots** after any visual change.

## Bot motion (does a bot look like a person?)

`src/core/motion.ts` scores a traced path the way a person would see it: direction
flips per second, twitches (a flip that undoes the last one within 0.18 s), harsh snaps
(faster than a finger can accelerate) and wobble (moving a lot without getting anywhere).
`tests/airhockey-motion.test.ts` holds every Air Hockey bot level to limits the old
"spazzy" bot failed (~9 flips/s and ~7 twitches/s before; ~2 and ~0.3 now), and the
playtest traces the bot paddle in real time and saves `airhockey-bot-path.png` plus
`airhockey-bot-motion.json`. `npm run motion` prints the numbers per level. Reuse it for
any other real-time bot (Sumo, Ping Pong, Tanks) by recording that bot's position.

## Bot tables

`npm run sim` plays the real-time action games bot against bot at every level pairing (plus a
mashing kid), `npm run sim:powers` compares each game's powers (its outlier line judges a power on its average against the other powers, and names any power that loses to no power on its own line: F332), and `npm run sim -- --idle`
plays every game with one seat that never touches the screen against each bot level: no
match there should be unfinished, and few should pass 3 minutes. It then plays both seats idle
(two people who walked away) and names the games that never end on their own (Air Hockey,
Sumo, Ping Pong today): the app pauses those after `IDLE_PAUSE` s with nobody touching
(F322), so a new real-time game that can't end belongs on that list, not in a stuck match. `npm run sim -- --selfout`
counts, for Snake and Sumo, the share of lost rounds a side lost on its own (Snake into a
wall or its own trail, Sumo off the ring untouched for a second; scripts/selfout.ts).
`npm run sim -- --ladder` (F342) plays the easy bot with head start +0 to +3 against normal and
against hard in each action game: the share it wins at each step shows whether the handicap
knob gives a parent and a young kid close matches.

## Minigolf strokes table

`npm run golf` plays every hole with two bots of each level over 12 seeds (`--n`, `--hole <id>`)
and prints par, the hole's stroke cap, and per level the average strokes, the ace rate and
how often a ball is picked up at the cap. Use it to set a new hole's par and its place in
`content/minigolf-holes.json` (easiest first), and to check an easy player rarely hits the cap.

In the cloud container set `PW_CHROMIUM=/opt/pw-browsers/chromium`. `PORT=<n>` picks the
preview port so several checkouts can run at once. `PLAYTEST_SECONDS` (default 8) sets the
real-time play per scenario.

To look at one game quickly: build, `npx vite preview`, open `/?seed=x`, then in the console
`__famiduel.store.data.profiles[1].bot = 'normal'; __famiduel.openGame('<id>')`, and
`__famiduel.runner.fastForward(seconds)` to skip ahead.

## Taps to play (F305)

`e2e/taps.spec.ts` counts the taps on the common paths at 390x844 and at 320x568 with Bigger
text, and fails if a button or game card on them is not wholly on screen (needs a scroll; F307
holds the first card whole even after a match): home -> playing 3 (the
game's card, then each person's Ready), result -> rematch 3 (Rematch + each Ready), result ->
another game 4 (Games, the card, each Ready), home -> a tournament game 4 (the tournament,
Play, each Ready; F308 keeps Play on screen while the lineup scrolls). If a change adds a tap, update the counts here
and say why in the PR.
