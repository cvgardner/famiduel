# Weekend improvement loop

A routine runs this every hour on Saturdays and Sundays. One run = one small, finished,
verified improvement merged to main (or nothing, if nothing passes).

1. `git fetch origin main` and start a fresh branch from it; `npm ci`.
2. `npm run verify`. If main is red, fixing that is this run's improvement.
3. Pick one improvement: the top item in `docs/backlog.md` that fits in one run, or a
   better one found by looking at `playtest-report/` screenshots, by playing a game with
   the playtest tools, or by researching (store reviews of 2-player apps, kids' UX
   guidance). Stay inside the decisions in CLAUDE.md (no chess, fair ads, no trademarked
   names, powers never sold, no sharing without a parental gate).
4. Implement it with tests. Run `npm run verify` and look at the screenshots of every game
   you touched. Never skip or weaken a test to get green.
5. Open a PR, merge it when verify is green, tick the backlog item with date + PR number,
   and add any new ideas you found to the backlog.
6. Republish the playable artifact (see CLAUDE.md) when the change is visible to players.
7. Post a two-line summary in the FamiDuel project thread.
