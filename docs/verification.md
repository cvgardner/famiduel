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
   It writes `playtest-report/index.html` (screenshots of every step for every game) and
   `playtest-report/summary.json`. **Look at the screenshots** after any visual change.

In the cloud container set `PW_CHROMIUM=/opt/pw-browsers/chromium`. `PORT=<n>` picks the
preview port so several checkouts can run at once. `PLAYTEST_SECONDS` (default 8) sets the
real-time play per scenario.

To look at one game quickly: build, `npx vite preview`, open `/?seed=x`, then in the console
`__famiduel.store.data.profiles[1].bot = 'normal'; __famiduel.openGame('<id>')`, and
`__famiduel.runner.fastForward(seconds)` to skip ahead.
