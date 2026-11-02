# Weekend improvement loop

A routine runs every hour on Saturdays and Sundays (PT). Since 2 Nov 2026 it works from a
shared todo list instead of doing one improvement per run: each run is a heartbeat that
adds new tasks to the list, then becomes a worker that finishes task after task for the
rest of the hour. One PR per task.

The list lives outside the repo, in the project's shared folder:
`/mnt/project-files/famiduel/todo.md` (the full routine prompt is `weekend-loop-prompt.md`
next to it). Chris can edit, reorder or delete lines any time; his lines and order win.

## The list

- Sections: Workers, In progress, Todo, Done, Dropped. One line per task.
- Task line: id (`F` + next number), size, what to change and how you'll know it worked.
  Sizes: (S) under 30 min, (M) under 60 min, (L) must be split before anyone claims it.
- Todo stays at most ~15 open lines, ordered by player impact. Chris's lines and
  "Fix red main" go first.
- The file is on a network mount and the last write wins: re-read it right before a change,
  change only your own lines, and re-read it ~10 s after writing to check the edit stuck.

## One run

Run id = the run's start time as `YYYYMMDD-HHMM` PT.

1. Setup: fetch and start from the latest `origin/main`, `npm ci`, read CLAUDE.md, this
   file, docs/verification.md and docs/backlog.md.
2. Leftovers: an open PR on a `claude/weekend-*` branch, or an "In progress" claim older
   than 90 minutes with no merged PR, is stale. Finish it (verify, then merge or close)
   before new work.
3. Heartbeat (under ~15 min): run `npm run verify` on main in a worktree. If main is red,
   "Fix red main: <what failed>" goes to the top of Todo. Add 2–5 tasks, rotating sources
   by hour: playtest-report screenshots and `summary.json` warnings or playing games with
   the playtest tools; every third hour web research (store reviews of 2-player apps,
   kids' UX and accessibility guidance); unchecked, in-scope items from docs/backlog.md.
   Skip duplicates of any section.
4. Worker: a worker is live if its "last seen" is under 70 minutes old. With two live
   workers, stop after the heartbeat. Otherwise add a Workers line and pull tasks:
   - Claim: move the line to In progress with `claimed <run id> <YYYY-MM-DD HH:MM PT>`,
     write, wait 10 s, re-read; start only if the claim is still there.
   - Build on `claude/weekend-<run id>-<task id>` from fresh `origin/main`, with unit tests
     for rule changes and a playtest check for anything visible (docs/adding-a-game.md for
     game changes). Stay inside the decisions in CLAUDE.md.
   - Verify with `npm run verify` and look at the screenshots of every game touched. Never
     skip or weaken a test. If it can't pass, move the task to Dropped with the reason (or
     back to Todo with a note).
   - Tick or add the item in docs/backlog.md with the date and PR number, open a PR,
     refetch main (merge it in and re-verify if it moved), then merge with a merge commit.
   - Move the line to Done with the date and PR number, update "last seen", take the next.
   - Republish the playable artifact (see CLAUDE.md) at most once per run, after the last
     merge players would see.
5. Stop: start no new task ~55 minutes after the run began, and claim nothing after
   00:30 PT Monday. Leave no half-claimed lines (finish, release with a note, or drop),
   remove the Workers line, add new ideas to Todo or the backlog, and post a short summary
   for Chris: tasks done with PRs and what they improve for players, tasks added, and
   anything that needs his call.

## Practical notes

- Work in a `git worktree` (copy `node_modules`) so verify on main and on a branch run in
  parallel, each on its own `PORT`. Never edit files in a worktree whose verify is running,
  and keep scratch scripts out of `scripts/` while it runs (it rebuilds `dist/` and
  typechecks).
- Other runs merge mid-hour: expect to merge main in and re-verify before merging.
