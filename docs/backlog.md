# Improvement backlog

The weekend improvement routine picks the top unchecked item it can finish in one run (or
something better it found), ships it, and ticks it here with the date and PR number.
Add new ideas at the bottom of the right section. Chris's decisions in CLAUDE.md win.

## Fixed
- [x] 2026-10-31 (Chris): hidden-info games can't be played face to face. Rock Paper
      Scissors between two people is now pass-and-play (src/engine/secret.ts): a look-away
      cover, the pick on a screen facing the picker, "Locked in", then the other player,
      then the reveal together. Audit and rules in docs/adding-a-game.md "Hidden information".
- [x] 2026-10-31: main was red. The Sumo playtest timed out because the normal bot won
      2-0 inside the 8 s real-time window, so the pause button it tried to tap was gone.
      The playtest now leaves a finished match through the result screen and records it
      as a warning instead of hanging.
- [x] 2026-11-01: main was red again. The Sumo playtest found "Last rope save!" at 2.4:1 on
      the pale sand (orange #ff8a5c with the pop's 50% black outline); it only shows when a
      wrestler uses their last rope save, so earlier runs never saw it. "The ring shrinks!"
      (same orange) was 2.4:1 too. Every pop-up word in every game now has a 75% black
      outline (`POP_OUTLINE` in engine/fx.ts): both reach 5:1+. A unit test reads every
      `fx.pop` in Sumo from the source and checks its colour at its size on both sand tones,
      so rare pops are checked every run, not only when a match happens to trigger them.

- [x] 2026-11-01 (Chris): "the minigolf screen orientation is really off sometimes". A phone
      lying flat has no reliable up, so leaning in to putt or lifting an edge made the OS flip
      the page to landscape and the portrait table shrank into a sideways strip. Browsers can't
      lock orientation, so src/engine/portrait.ts counter-rotates the whole app when a phone
      reports a landscape turn (Stage maps touches back through it). Unit test + e2e on an
      844×390 landscape phone. The course's own turn now always lands on 0° or 180°.
- [x] 2026-11-01 (Chris): Minigolf needs "a bunch of stages that get randomized" and the
      "too fast to drop" rule "might feel bad for players used to just needing a hole".
      12 new holes (22 in all; a match still plays 3 picked by the seed, easier first).
      Cup: capture speed 250 -> 420 (only a hard-hit ball skips over), and a ball that does
      rattle over loses 45% of its speed as it rolls out, so it usually stops close.
      Found on the way: the bot's distance map stopped spreading past the first wall (a
      float32 rounding slip in the Dijkstra), so bots misread most of Zig Zag-like holes.
      Bot noise retuned for the new cup: easy +0.76, normal -0.44, hard -1.39 per hole.

- [x] 2026-11-01 (Chris): 7-game tournament. Home button "7-game tournament" picks 7
      different action/aim games by seed; first to 4 wins, a draw adds a game; the lineup
      screen shows who won each one; quit games wait; result screen says "Next game".
      Unit tests (tests/tournament.test.ts) and an e2e bot-vs-bot run to a champion.

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
- [x] 2026-11-01 (Chris's playtest): Sea Battle rules now match the ones kids know: a shot
      that hits a ship fires again, until you miss. A sinking counts as a hit; a miss, a
      mine or an Airstrike (already 5 shots) passes the turn, and a hit on a head-start
      bonus turn keeps both shots. The header says "<name>, go again!" once the shell
      lands ("Hit! <name> goes again…" for a bot), and the how-to line says "A hit fires
      again." (`RULES.hitAgain`, an `again` event). Measured over 600 bot-vs-bot games a
      level: seats stay even (player 2 wins 47-51%, first mover 48-52%), and a match
      needs about a third fewer turns (hard 82 → 51, normal 95 → 63, easy 111 → 80), so
      two people pass the phone a third less often. Unit tests pin the rule; a new playtest
      hits twice against the bot, checks the turn stays and the header says so, then misses
      and checks the turn passes (`seabattle-hit-again.png`).
- [x] 2026-10-31: Sea Battle seat bias was noise: 2000 mirrored games per level give
      player 1 49% (easy), 49% (normal), 50% (hard); first mover 49-52%. A unit test now
      pins seat balance. The sim found a real problem instead: the easy bot ignored its own
      radar contacts (it pinged "found!" and then fired anywhere), so an easy bot holding
      radar lost ~70% to one holding mine or airstrike. Every level now fires into a found
      box while hunting; easy radar vs mine/airstrike is now 45%/40% (was 31%/29%).
- [x] 2026-10-31 (research run): tap targets for small hands. Kids' UX guidance (NN/g:
      young children need larger controls than adults' 1 cm; Apple HIG and WCAG 2.5.5:
      44 pt minimum; kids-app guides use 56-64 dp for ages 4-6) vs our menus on a 320×568
      phone found 26 targets under 44 px: the intro's "← Back" (55×24), both Ready buttons
      (39 px tall), the pause dot (34×34), settings toggles (40 px), colour swatches (36 px)
      and head-start / bot buttons (34 px). All are now at least 44 px (Ready 48, swatches
      fill the row with the dot drawn inside, pause keeps its small dot inside a 44 px
      target). The playtest now fails on any target under 44 px and checks every intro also
      fits a 320×568 phone (Sumo and Penalty needed 5 px back there).
- [x] 2026-10-31: letterbox bars on tall phones. On a 390×844 phone the fixed world left
      75 px black bands top and bottom (more on 19.5:9 phones). The stage now stretches the
      world's own edge row into each bar (blurred so a power button touching the edge glows
      instead of streaking, darkened 15% → 55% toward the screen edge), and the same for
      side bars on wide screens. Every game gets it with no per-game code: the air hockey
      goals now run off the phone in each player's colour, the grass and tables fill the
      screen. The playtest checks the bars carry each game's edge colour on a tall phone.
- [x] 2026-10-31: haptics. Hits, wall thuds, chops, splashes, power use, goals and the win
      now give a short vibration where the browser can (Android Chrome; iPhone Safari has
      no vibrate, so nothing happens there and the setting is hidden). Wrong moves get a
      double tick. Driven from the sound names in `engine/haptics.ts`, so all 15 games got
      it with no per-game code; small buzzes closer than 70 ms are dropped so rallies
      don't hum, goals and the win always come through, and every pattern is under
      400 ms. Works with sound off. New "📳 Vibration" toggle on the home screen (saved;
      older saves get it on). The playtest counts vibrations per game and checks the
      toggle turns them off.
- [x] 2026-10-31: ghost finger. Each intro half now shows a small looping picture of the
      game's gesture beside the title (a white fingertip that taps, holds while a ring
      charges, pulls back from a ball, flicks, slides a paddle, pushes a stick then taps
      FIRE...), so a kid who can't read the how-to line can copy it. 11 gestures, named per
      game in `content/games.json` (`gesture`), drawn in CSS (`src/app/demo.ts`). It shows
      for a game's first 3 matches on the phone, then goes away; it holds still when the
      phone asks for reduced motion.
      On short phones it is no taller than the title line so tight intros still fit. The
      playtest checks every intro shows it in both halves without pushing the title off a
      320 px phone, and that it is gone after 3 matches.

## App
- [x] 2026-11-01 (Chris's playtest: "action games are the stars"): the home grid now leads
      with the action games. Minigolf (the hero) and the free trio keep the top row, then
      Ping Pong, Snack Snatch, Tank Duel, Snake Duel, Penalty, Quick Draw, Chop Chop; Sea
      Battle, Four in a Row, Checkers and the two extras moved to the bottom. A unit test
      guards the order and the playtest checks the grid and saves `home-small-phone.png`.
- [ ] Rivalry card after a match night (shareable image, behind a parental gate).
- [ ] Family Wrapped prototype from the on-device match history.
- [x] Daily minigolf course (seed from the date) with a "beat my score" link.
      2026-11-07 (F94): first half, no link yet. Minigolf's intro has a "📅 Today" switch
      (not in tournaments): today's course is 3 holes picked from the local date
      (src/games/minigolf/daily.ts), the same on every phone all day whatever the match seed.
      The day's best total by a person (bots don't count) is kept on this phone and shown on
      the intro strip and the result ("New best today: 9!"). Tests tests/daily-golf.test.ts,
      playtest "minigolf: today's course". F96: home's Minigolf card wears a 📅 badge until
      today's course is played on this phone. Still to do: the "beat my score" link and a
      friends leaderboard, both sharing, so behind the parental gate.
- [ ] Remove-ads / unlock-all screen mock (no real purchases yet); free trio badge.
- [x] 2026-10-31: bot difficulty per game. The bot's level was one setting for all 15 games,
      buried in the player sheet, so a parent whose kid was losing at Checkers had to leave
      the game, open the sheet and make Air Hockey easier too. A bot's half of the intro now
      shows Easy / Normal / Hard where a person's Ready button sits (same 48 px row, so no
      intro grows); the pick is remembered for that game only (`botLevels` in the profile,
      `botFor()` in `src/app/store.ts`), and changing "Who plays" on the player sheet resets
      every game to it. Playing it showed every bot intro with a power overflowed a 320×568
      phone (the bot's picked power showed its description: Sumo needed 317 px of 254), so
      on short phones a bot's half drops the how-to line and power descriptions. The
      playtest opens every intro with a bot on a 320×568 phone (fits, 44 px targets), turns
      the Checkers bot to Easy, checks the match uses it and that it survives a reload while
      Air Hockey stays Normal (`bot-level-intro.png`).
- [x] 2026-11-01: left-handed controls. Tank Duel is the only game with two thumb
      controls (stick on the left, FIRE on the right), so a left-handed kid steered with
      their weak thumb. The player sheet now has a Hand row (Right-handed / Left-handed,
      saved per player, older saves stay right-handed); a left-handed seat gets FIRE on the
      left and the stick on the right, including the generous strip zones, the ammo pips and
      the intro's ghost finger. Layout in `src/games/tanks/controls.ts` (unit tested: exact
      mirror, zones never overlap, both on screen). The playtest sets it through the sheet,
      checks a steer on the right drives without firing and a tap on the left fires
      (`tanks-left-handed.png`). Corner power buttons were left alone: Minigolf and others
      keep scores in the opposite corner.
- [x] 2026-10-31 (research run): colour-blind safe player colours. About 1 in 12 boys has
      red-green colour blindness, and the player colour is how two kids tell whose paddle,
      snake or score is whose. Ran the six old colours through the Machado 2009 simulation
      of protan / deutan / tritan vision (OKLab distance, look-alike under 0.1): 6 of 15
      pairs looked alike (green/teal 0.02 for tritan, blue/purple 0.05 and pink/green 0.09
      for deutan, green/orange, blue/teal, blue/green), the old orange sat next to the gold
      "ready" highlight, and both players could pick the same colour. No 6-colour set kept
      every pair and the gold apart, so the palette is now 5: Blue, Pink, Mint, Orange,
      Purple, every pair at least 0.10 apart for all four kinds of vision and from gold
      (`src/core/colors.ts`, unit tested). The other player's colour is shown crossed out
      and can't be picked, swatches are named for screen readers, and old saves move to the
      nearest new colour (teal/green → Mint, and a clash moves Player 2). The playtest checks
      the picker and saves air hockey as protan / deutan / tritan players see it
      (`colours-airhockey-*.png`).
- [x] 2026-10-31 (research run): readable text everywhere. Store reviews of the leading
      2-player app complain the screen is cramped on small iPhones; kids' typography guidance
      (Cantuni, "Typography in digital products for kids": early readers need a bigger
      x-height than adults, sentence case over ALL CAPS) and Apple's 11 pt minimum vs our
      canvas found 20 labels drawn at 9-12 world units, i.e. 8-10.7 px on a 320 px phone:
      Minigolf's HOLE / TOTAL / "★ −1 a hole" / scorecard pars, Tanks' "1 bonk" and "Sudden
      bonk" line, Snake's round line, Sea Battle's "Ships sunk", Ping Pong's "vs 3", Chop
      Chop's "them: 4", Quick Draw's handicap note, Checkers' "Taken: none yet". Every word
      or number on the canvas is now at least 13 units (`MIN_TEXT` in engine/draw.ts, 11.5 px
      on a 320 px phone), Minigolf's headers are sentence case, and menu text is at least
      12 px (game kinds, power descriptions were 11). A unit test scans every literal text
      size; the playtest records every word drawn while it plays each game and fails on
      one under the floor, and checks menu font sizes on a 320×568 phone.
- [x] Accessibility: larger text option (a setting that scales canvas text and menus ~1.25×;
      needs the intros to fit at that size).
      2026-11-07 (F7a, canvas half): Settings > Look > "Bigger text" draws game words 1.2x
      (`setTextScale`, `scaledSize` in draw.ts; big banners only grow up to 28 units). A
      playtest plays every shown game with it on at 320x568 and 390x844 (bigtext-*.png) and
      fails on words past the screen edge (`__edges` probe). It found Sumo's round banner,
      Penalty's "Shot picked! Swipe again to change" and Snake's CRASH! by a wall running
      off; fx pops now shrink to fit and stay inside the edges (`insideX`). Menus: F7b.
      2026-11-07 (F7b, menus): the same switch scales every menu font up to 20 px by 1.2
      (`--ts` on <html data-bigtext>): home, settings, pause, result. The intro stays at 1x:
      with bigger rules and power cards it overflowed in 8 games at 320x568 and 390x844
      (F7c). The layout playtest runs the intro fit, home and settings again with it on.
      2026-11-07 (F7c): the intro scales too. With Bigger text on it takes the short-phone
      layout on every phone (descriptions for the picked power only, a bot's half without the
      how-to, the middle strip kept to one line at 1x); on an iPhone SE 1st gen (height 600 or
      less) the intro alone stays 1x. Layout playtest: all intros fit; bigtext-intro-*.png.

## Content
- [ ] Mini pool (first update).
- [x] More minigolf holes (target 18): 22 holes now (checked 2026-11-07; this line said 10).
- [x] 2026-11-01: two new Minigolf holes, so a 3-hole match repeats less often (8 → 10 holes,
      56 → 120 different courses). River Bridge (par 3): water across the middle with a
      bridge, and a bumper past it that blocks the straight shot. Sand Castle (par 4): a
      castle block in the middle, a short lane through a sand pit on one side and a longer
      clean lane with a jutting wall on the other, and a slope that helps you round the top.
      Measured with bots (20 seeds, both seats): River easy 3.75 / normal 2.90 / hard 2.33
      strokes, no aces (it was 34 aces in 40 for hard before the bumper); Castle 4.50 / 2.75 /
      2.17, close to Zig Zag. A new playtest opens every hole in a real match, saves
      `minigolf-hole-<id>.png`, checks the letterbox bars and that two hard bots finish it.
      Verify also caught the hole card's words (drawn at full opacity) popping in over the
      bright grass before their dark card had faded in ("Dog Leg" 2.8:1 when a match ended
      mid-fade). The card and the shot banner now fade their words with the card, and the
      contrast probe judges a label at rest: a label only ever caught mid-fade is a report
      warning, not a failure (`keepSample` in engine/draw.ts, unit tested).
- [x] More tank arenas, more Snack Snatch snack types.
  - [x] 2026-11-07 (F84): Tank Duel has 8 arenas (new: Pillars, Crosses, Diamonds). Measured with
        150 rounds of each bot pairing per arena: rounds average 5-10 s like the old five, and
        self-bonks and seat splits sit inside the old arenas' range (a maze-like "Hallways" try
        was dropped: the top seat won 98 of 137 normal rounds). tests/tanks.test.ts plays a round
        on each arena; the playtest saves tanks-arena-<name>.png for each.
  - [x] 2026-11-07 (F86): Tank Duel seat bias found while measuring F84: between two normal bots
        the bottom seat won ~64% of first rounds on Lanes and Rooms (400 rounds, same with the
        bots' think order swapped or separate random streams). Cause: both spawns sat exactly on
        the line between columns 4 and 5, and a cell lookup floors, so both tanks counted as
        column 5, which is a different cell for each seat once the arena is turned 180°. Each
        spawn now sits a hair to its player's own right; all 8 arenas land at 48-54%. Tests:
        spawns in mirrored cells; equal bots win 40-60% of 200 first rounds from either seat.
  - [x] 2026-11-07 (F87): no other seat edge. Mirror matches (equal bots, powers off) at
        n=400 per row with the F86 fix in: every action game and level lands at 44-55% for the
        bottom seat (Air Hockey normal and Snake hard 44%, Ping Pong hard 55%; the spread n=400
        gives by chance). Whole-match rows dilute a per-round edge (tanks' edge was on 2 of 5 arenas,
        a small share of matches), so a game with rounds on different layouts needs a per-round check like
        tests/tanks.test.ts's.
  - [x] 2026-11-07 (F85): Snack Snatch serves six snack kinds (new: a wrapped sweet and an orange
        slice, drawn in code). Looks only: every kind scores 1, a mirrored pair shares its kind, and
        the pot makes the same number of random draws, so matches play out exactly as before.

## Ideas found 2026-10-31
- [x] 2026-10-31: Sumo: a mashing kid never won a match against any bot, even with the
      full head start (0% at no help, 7.5% vs easy at ★★★). Measured why: 95% of the
      masher's lost rounds were self-outs after the 3-6 rope saves ran out (in ~4 s); the
      bot barely pushed them. A slower "waits a beat after GO!" easy bot was tried and
      changed nothing (the masher falls out with no help from the bot), so it was dropped.
      Instead the head start now gives far more rope saves: 3 at none (unchanged), about
      7 / 12 / 16 at ★ / ★★ / ★★★ (was up to 6). With ★★★ a pure masher now wins 41% of
      matches against the easy bot, 8% against normal, 2% against hard; rounds last ~16 s
      instead of ~8. The knots wrap into two rows of 8 under the round pips. Unit test pins
      the masher rates; the playtest plays a ★★★ kid against the easy bot and checks both
      knot rows are drawn (screenshot `sumo-head-start.png`).
- [x] Playtest: per-game "self-out" counter (player lost without the other touching them)
      would catch the same trap in other games (Snake walls, Minigolf water).
      2026-11-07 (F45): as a sim table rather than the playtest (the playtest's matches are
      too short to lose many rounds): `npm run sim -- --selfout`. Snake counts a crash into a
      wall or your own trail, Sumo a ring-out untouched for over 1 s. Minigolf water costs a
      stroke, not a round, and Air Hockey's own-paddle goals are nearly all deflected shots
      (hard bots 85%), so neither is counted. n=20: a mashing kid loses 98% of Sumo rounds
      and 90% of Snake rounds by themselves vs easy; with the full head start 48% / 82%.
      Bots never walk off in Sumo (0%). Snake bots self-crash in 48-51% (easy), 82-88%
      (normal) and 35-38% (hard) of lost rounds. Checked (F60, no change): a normal bot's
      self-crash is the end of a long round, boxed into its own patch (median 30 free cells
      next to its head when it crashes), while easy (median 646) and hard (417) crash with
      room to spare, easy from fumbles and hard from the human turn gap on tight U-turns.
- [x] 2026-11-01: Minigolf pars and hole order now come from measurements. Every hole was
      played by the easy bot (a young kid) and the normal bot (a grown-up), 24 rounds each:
      many par 3s were really 2-stroke holes (the easy bot averaged 2.0 on Crater, 2.3 on
      Speed Bumps and Fork, 2.9 on Bumper Bowl), so a kid "beat par" on them, while Windmill
      (normal 3.7 on par 3) and Twin Gates (normal 4.2 on par 4) left grown-ups over par.
      Par is now the whole number between the two: Crater, Speed Bumps, Fork, Pinball and
      Bumper Bowl are par 2, Windmill par 4, Twin Gates par 5. The list is re-sorted by
      measured strokes (Warm-Up Lane stays first to teach the putt), so a match's three
      holes really get harder and "Birdie!" means something. Unit test checks every hole's
      par sits between the bots (easy no more than 0.5 under, normal no more than 0.5 over)
      and that pars never drop along the list; the hole playtest checks each match's pars
      ramp up. (Replaces the "lip on the bowl" idea: the bowl is fine, its par was wrong.)
- [x] 2026-11-01 (PR #70): Bot pace table: `npm run sim` (scripts/sim.ts) plays the 8 real-time
      action games' bots at every level pairing, seats swapped, powers off (`--powers` on,
      `--game <id>`, `--n <matches>`), and prints win share, draws, unfinished and match length.
      First read (n=10–40): the higher level wins 80–100% everywhere, so the levels are real
      steps. Follow-ups below.
- [x] Air Hockey bottom seat won only 35–45% of mirror bot matches (n=40 per level) and ~3% of
      normal/hard matches ran past 5 minutes; check for a seat asymmetry and a stall with
      `npm run sim -- --game airhockey --n 200`.
      2026-11-07 (F14): no change needed. Seat bias is noise: with 400 more seeds the bottom
      seat wins 49% (normal) and 45% (hard), and letting the top bot think first flips easy
      from 41% to 55%, so it follows which bot draws from the shared rng first, not the table.
      No stall either: every goal gap over 2 minutes (3-5% of normal/hard bot matches reach
      5 minutes) is a real rally, ~1.2 paddle hits a second, the puck fast half the time and
      spread over the whole table, with 0-2 air drifts. Two good defenders just keep
      returning it; people vs a bot don't play that long. If bot-vs-bot (tournament demo)
      matches feel long, a rally speed-up (puck a little faster after ~30 s without a goal)
      would be the fix.
- [x] 2026-11-07 (F116, already done): `npm run sim` has "kid" and "kid+3" rows for every game (scripts/simlib.ts Masher). Was: Add the masher model (tests/sumo.test.ts) as a "kid" row to `npm run sim` for every game.
- [x] 2026-11-07 (F112, no change needed: now easy Radar beats Airstrike 57% and Mine 60%, normal 53% / 59%,
      n=200 seeds played from both seats; the bots follow up their radar contacts). Was: Sea Battle: easy radar is still a bit weaker than airstrike (40/60 bot-vs-bot) because
      the sloppy easy bot spends more turns targeting, when it never radars. Fine for now;
      recheck if kids pick radar and lose.
- [x] 2026-11-01 (PR #72): Power balance sim: `npm run sim:powers` (scripts/powers-sim.ts, shared
      code in scripts/simlib.ts) plays each power against each other power and "none" with
      the same bot level on both seats, seats swapped, and flags powers averaging outside
      35–65%. First read (n=40, normal bots), bot use only, so check with people before tuning:
- [x] 2026-11-02 (PR #74): Snack Snatch Sticky won 77% (88% vs Double and vs None). It now lasts
      3 seconds instead of 5: normal bots, n=80: sticky 62%, magnet 49%, double 51% (4 s was
      still 74%). Sticky still beats Double (~75%) one on one; recheck with people.
- [x] 2026-11-02 (PR #73): Chop Chop Double won 95% (beat every power 93–98%). Double now covers
      the next 4 chops instead of 4 seconds (a slow tapper gets as much from it as a fast one),
      and Branch Shield lasts 2 seconds instead of one branch, so you can mash one side; the bot
      mashes too under it (1.5x its rate, never past HUMAN.tapGap). Normal bots: shield 53% /
      freeze 63% / double 64% (was 28 / 57 / 92). Hard mirror bots still favour Freeze (76%):
      one second of a fast tapper is a lot, but hard-vs-hard is near-deterministic.
- [ ] Snake Boost wins 25% and loses to None (23%): the bot probably boosts into trouble;
      check the bot's Boost use before changing the power.
- [x] 2026-11-02 (PR #75): Ping Pong Smash won 71-74%: the power sent the ball at the top smash
      speed (980) every time. It now returns at 780, or faster if your own flick was harder
      (n=100, normal bots: smash 63%, slow-mo 44%, curve 49%; `npm run swipes` unchanged).
- [x] 2026-11-07 (F102): re-read with seeds played both ways (below). Was: Quick Draw Slow Time wins 74%; Ping Pong Smash 71% (Slow-mo 34%); Tanks Shield 68%;
      Air Hockey Split 33% (loses to None 40/60).
- [x] 2026-11-07 (F20, PR #105): Quick Draw bots jump the gun like people: each round a bot
      may twitch during the wait with nothing on screen (easy 10%, normal 4%, hard 1%; about
      9 / 2 / 1% of rounds lost early in bot mirrors). `npm run sim:powers -- --game quickdraw
      --n 300`: Slow Time 74% -> 65% (the edge of the 35-65% band), Double Shot now beats None
      57/43 (was 54/50), Fake-out 47% unchanged. Chop Chop's wrong-side chops are not done yet.
- [x] 2026-11-07 (F15, PR #106): Quick Draw Slow Time 65% -> 63% (n=1000, normal bots). The
      "get ready" glow used to start a fixed 0.45 s before DRAW!, so a person could count it down
      to a perfect tap (the bot got 0.15 s off its reaction). The lead is now random each round
      (0.45-1.1 s, `RULES.pulseLeadMin/Max`): it says "soon", not "now". A warned bot still waits
      for DRAW! and reacts 0.06 s faster (`RULES.pulseEdge`). Fake-out 46%, Double 50%, None 46%.
- [x] 2026-11-02 (PR #77): Air Hockey Split won 33% because the bot split pucks that were coming
      at its own goal (two to stop). It now splits just after a hit, while the puck heads at
      the other goal, as a person would: split 56% at normal (easy 59%, hard 63%), n=60.
- [x] 2026-10-31: Playtest: Sea Battle never got past fleet placement in real-time play
      (random touches almost never hit Ready, and firing needs the same square tapped twice),
      so it reported 0 buzzes. Turn-based games can now have a "person" in the playtest
      (`playtest/person.ts`) that reads the screen and does the obvious next thing: wake the
      pass-the-phone cover, tap Ready, then aim and fire at an untried square. The playtest
      fails if no shots are fired against the bot or between two people; Sea Battle now
      buzzes 8 times and its screenshots show a match in progress. Playing it showed a real
      bug: for 0.7 s after the bot's shot the header said "Player 1 is aiming…" (the human's
      name, in the human's colour) because it read the logic's turn, which had already moved
      on. The header now names the seat the screen is showing (bot, and the "Missed…/Direct
      hit!" beat after a human shot).
- [x] In-game canvas buttons: Checkers squares (45 units) and Sea Battle grid cells are the
      smallest canvas targets; check their size on a 320 px phone and whether a mis-tap is
      easy to undo.
      2026-11-07 (F58): Sea Battle (Checkers is hidden, so skipped): a cell is 27 units, 24 CSS
      px on a 320×568 phone, under the 44 px guideline but safe because a shot is two taps:
      the first only aims (a ring), a tap on another cell moves the aim, only a second tap on
      the aimed cell fires. Playtest "sea battle: on a small phone a cell is a fair target..."
      pins the size and the stray-tap behaviour (seabattle-small-aim.png). Bigger cells (30
      units, ~27 px) would need the fleet line, the small grid and the Ready button moved
      down; not worth it while the two-tap aim makes mis-taps free.
- [x] Ages 4-6 guidance asks for 56-64 px primary buttons; consider a "little hands" setting
      that enlarges Ready / power cards (needs a taller intro layout).
      2026-11-07 (F80, PR #140): Settings > Look > "Little hands" (`settings.bigButtons`, <html
      data-bighands>): the intro's Ready button, power cards and bot level buttons are at least
      60 px tall (Ready was 48). No taller layout needed: playtest "little hands: ..." opens
      every shown game at 320x568, 360x640 and 390x844, with and without Bigger text, two
      people and vs a bot, a power picked in each half, and fails on a button under 56 px or
      an intro out of its half (bighands-sumo-*.png). In-game buttons are not changed yet.
- [x] 2026-10-31 (research run): pause sits on the centre line where both players' hands
      rest, and one tap stopped the match for both. Guidance for small hands (Smashing
      Magazine's "A Dad's Plea to Developers of iPad Apps for Children", uxdesign.cc "Design
      considerations for little fingers") asks to keep stop/exit controls away from where
      kids tap or to make them deliberate. Pause now needs a 0.6 s press-and-hold: a gold
      ring fills around the dot, a quick tap only shows "Hold to pause" to both players
      (one upside down), sliding off cancels. Keyboard Enter/Space and Escape pause at once.
      The playtest monkey's touches now land on whatever is under the finger (so it can hit
      the pause button like a real hand); the report counts ignored pause taps per game and
      warns if a playing hand ever paused a match. Logic in `engine/hold.ts`, unit tested.
- [ ] Letterbox: games could use the bars for real (e.g. score or power buttons further
      from the play area on tall phones) by exposing the visible world height to views.
- [x] 2026-11-01: Minigolf's top and bottom HUD strips are near-black, so on tall phones
      its letterbox bars still read as black bands (a 390×844 phone has ~100 px of them).
      Each strip now ends in a 3-unit edge in that player's colour (pulsing brighter on their
      shot), which the stage stretches into the bar: each end of the phone glows in its
      player's colour and shows whose shot it is from across the table. The hole playtest
      now fails if either bar's brightest channel is under 55 (black bands peak near 25).
- [x] Other games whose world edge is dark (Sea Battle's deep water, Quick Draw at night?)
      could check their bars the same way; `barPeak` in the playtest measures it.
      2026-11-07 (F57): measured every shown game on a 390×844 phone. Sea Battle (37/44),
      Snake (38/51) and Rock Paper Scissors (44 top) read as near-black bands; Quick Draw is
      fine (88-98). Those three now draw a 3-unit seat-colour edge (`seatEdges()` in
      engine/draw.ts: your end in your colour, the far end in theirs; Sea Battle's cover
      screen too), so their bars peak at 91-99. The "play like a person" playtest now fails
      any shown game whose bar peaks at 40 or less.

## Ideas found 2026-11-01 (minigolf holes run)
- [x] 2026-11-01: `text()` set `globalAlpha` to its own `alpha`, so a caller's fade never
      reached the words: a disabled button's label stayed bright on its 35% circle, and
      `PowerButton.render` reset the alpha for its own parts, so Penalty's unusable power
      (dimmed to 45% by the game) drew at full strength. `text()` now multiplies the canvas's
      alpha by its own and buttons draw relative to the caller's alpha; Minigolf's hole card
      and shot banner no longer pass their fade twice. The contrast probe now judges a label
      at the opacity it is really drawn at. Unit tests with a recording canvas
      (`tests/alpha.test.ts`); verify warnings unchanged from main.
- [x] 2026-11-01: Minigolf hole order by measured difficulty (see the pars entry above).
      Bumper Bowl now sits among the par 2s; Lily Pond and Hill Climb lead the par 3s.

## Ideas found 2026-10-31 (haptics run)
- [ ] Store wrapper: plug a native haptics call (Capacitor Haptics, iOS Taptic) into
      `new Haptics(vibrate)` so iPhones get the same feel.
- [ ] Haptics per seat isn't possible on one phone (both players feel every buzz); keep
      patterns for shared moments only. If kids find it distracting, default it off for
      the turn-based games.

## Ideas found 2026-10-31 (pause run)
- [x] Same hold-to-confirm for the result screen's "Games" button if kids skip the result
      before the other player has seen it (check in the playtest how fast the monkey hits it).
      2026-11-07 (F37, PR #96): simpler than a hold: the result's buttons ignore taps for
      0.8 s after it appears (dimmed, then fade in), so a last swing or mashed tap where
      Games / Rematch now sit can't skip it. Playtest "result: a tap meant for the game...".
- [ ] VoiceOver/TalkBack: the pause button says "press and hold"; a screen reader double
      tap is a click with detail 0, which pauses at once. Check that on a real phone.
- [x] Guided Access / screen pinning tip on the home screen for parents of toddlers (the
      OS-level way to stop a kid leaving the app), behind the parental gate.
      2026-11-07 (F68): Settings > For grown-ups > Grown-ups corner, behind the first parental
      gate (src/app/gate.ts: a times-table question in words, a new one after a wrong answer;
      reusable for sharing and the unlock screen). Shows Guided Access (iPhone/iPad) and App
      pinning (Android) steps. Nothing leaves the phone; playtest grownups-*.png.

## Ideas found 2026-10-31 (text size run)
- [x] 2026-11-01 (research run): rematches take turns starting. Store reviews of the
      leading 2-player app (justuseapp.com review digest) complain that "the first player
      has an advantage" (basketball) and ask for "a second shot for the other player". Ours
      tossed a fresh coin every match, so a kid could go second rematch after rematch in
      Four in a Row, Checkers, Tic-Tac-Toe, Penalty (first kicker), Minigolf (first tee) or
      Sea Battle (first shot). Now each game remembers who started its last finished match
      this session and the Rematch (or picking the game again) hands the start to the other
      seat, like families do at a table. The first match is still the seeded coin toss (the
      coin is still drawn, so seeded matches are unchanged), Tic-Tac-Toe's head-start rule
      still lets a trailing player start more, and a quit match doesn't count. Games take
      `ctx.starter`, views report `firstMover()`, the rule is `StarterLog` in
      `src/app/starter.ts` (unit tested for all six games); the playtest plays three matches
      of five turn games through the real Rematch button and checks the start swaps each
      time (`rematch-starter.png`). Contract noted in docs/adding-a-game.md.
- [x] 2026-10-31: text contrast on the canvas. The playtest now checks every word drawn while each game is played against
      the pixels behind it (WCAG 1.4.3: 4.5:1, or 3:1 for large bold text; the best
      contrast a label ever had counts, so fading pops are judged at their peak) and fails
      on any label below. Found 22 faint labels in 7 games, mostly white words on the
      player colours (white on Mint is 1.6:1, on Blue 2.5:1): the pass-the-phone "Tap when
      only … is looking" pill (Sea Battle, RPS), RPS "Pick in secret!", Ping Pong "vs 2" on
      the score badge and Snack Snatch "TAP" on the critters now use `inkOn()` (dark ink on
      light colours, white on dark), Sumo names and Ping Pong "SERVE" got a dark outline,
      Quick Draw's brown words on sand ("Wait for it…" 2.6:1, scores, "You 312 ms") are
      darker, Tanks' arena name brighter. Maths in `src/core/contrast.ts` (unit tested,
      including an ink for every player colour); probe in `engine/draw.ts` (`__contrast`).
      Limit: Purple is mid-bright, so its best ink is white at 4.4:1; pill labels are drawn
      at 19 px bold (large text) so they pass, small badge text sits at 4.4.

## Ideas found 2026-10-31 (ghost finger run)
- [x] Ghost finger in play: show the same gesture once over each player's own half at the
      first serve / first turn of a first match (needs a view hook per game for where).
      2026-11-07 (F59): no per-game hook needed. At a game's very first match on this phone
      (`firstMatchOf()` in app/demo.ts) the app lays the intro's finger, twice the size, over
      each person's half of the play screen (the top copy turned to face them; bots get none)
      through the countdown and the first moments, ~5 s, then it fades. A seat's first touch
      in its half clears its own copy. It sits between the middle and each player's edge;
      Ping Pong, whose hints sit there, puts it on the paddle row (`"demoAt": 0.9` in
      content/games.json). Playtest "ghost finger: the first match shows it in play..."
      (ghost-finger-in-play.png).
      2026-11-08 (F137): ~5 s was too long: its dark card sat over Penalty's goal and Snack
      Snatch's lower lanes after GO. Now it shows through the countdown plus one second of
      play (PLAY_DEMO_MS 2800); the solo playtest checks every game's copy is gone by then.
      2026-11-08 (F138): that only fits one of Penalty's two roles, so each seat's finger
      starts on the role it plays first: the shooter's swipe, or (class `keeper`, the loop
      started 2.6 s in) the keeper's dive. Playtest checks which seat gets which.
- [x] 2026-11-01: A "?" brings the ghost finger back. After a game's first 3 matches the
      finger used to vanish for good, so a kid who forgot the gesture (or a new kid on the
      phone) had only the how-to text. Each person's intro half now shows a small "?" where
      the finger was; one tap plays the finger in that half only (mirrored for a lefty's
      stick). It is a 44 px target whose visible circle is 26 px, with negative margins so it
      never makes the title line taller. Bot halves get none. Unit tests cover the button
      and the lefty mirror; a new playtest opens every intro on a 320×568 phone after 3
      matches, checks both halves have a 44 px "?" that fits, taps one and checks only that
      half shows the finger (`demo-help.png`, `demo-help-tapped.png`).
- [x] 2026-11-01: Remember a "?" tap. A kid who needed the ghost finger once usually
      needs it again, but the "?" came back every intro, so they had to remember to ask.
      Now a seat that taps "?" gets that game's finger again by itself in its next intro
      (Rematch, or picking the game again), only in their half and only for the same person
      (a new name in the seat gets the plain "?"), until a match of that game is played to
      the end; then it is back to the "?". Backing out of the intro keeps it. Session only,
      nothing saved. `HelpMemory` in `src/app/demo.ts` (unit tested); the "?" playtest now
      reopens the intro, checks the finger shows with no "?" in that half only
      (`demo-help-remembered.png`), finishes a match and checks the "?" is back, and that
      another person in the seat doesn't inherit it.
- [x] 2026-11-01: "How to play" mid-match. A kid who only realised during a match that they
      didn't know the gesture, or forgot what their power does, had to quit to see the intro
      again. The pause menu now has "❓ How to play": the match stays paused and each
      person's half (facing them, like the intro) shows the ghost finger (mirrored stick for
      a lefty), the how-to line and the power they picked ("Your power: Shield …"). A bot's
      half shows no finger or rules. "← Menu" goes back to the pause menu, "Resume" plays on.
      `howToHalfHtml()` in `src/app/demo.ts` (unit tested); a new playtest opens it in every
      game on a 320×568 phone, checks both halves fit with finger, rules and power, that the
      match stays paused and Resume resumes (`pause-help.png`, `pause-help-bot.png`), and the
      44 px target check now covers that screen.
- [x] 2026-11-07: How to play mid-match shows each player's power meter under their picked
      power: "Charging: 60%" with a small bar, "⚡ Ready! Tap your power
      button", or "✨ On now!". The meter fills from play, not time, so it never says "ready in
      4 s". `powerStatus()` in app/demo.ts, `energyOf()` in engine/game.ts; the pause-help
      playtest checks both halves show a state in every game with powers.
- [x] A short animation of each power in How to play, for kids who picked it without reading.
      2026-11-07 (F70, PR #133): the three free games (Minigolf, Air Hockey, Sumo) draw a 2 s
      looping picture of each power beside the picked power on How to play (inline SVG in
      `app/powerpic.ts`; you in your seat colour, the other player grey): the gust blowing a
      shot past the cup, the cup reeling a ball in, a ball floating through a wall; a paddle
      freezing, growing, the puck splitting; the stomp's shockwave, growing big, the other
      wrestler sliding. Unit tests check every free power has one with matching key times; the
      how-to-play playtest checks both halves show it, that it moves, and saves
      pause-help-pic-<game>.png. Other games next (`hasPowerPic()` is false there today).
      2026-11-07 (F76, PR #135): the intro shows it too once a person picks: on tall phones
      in the picked card, in the icon's place (48x33, a row under the cards pushed Sumo 25 px
      out of its half); on short phones and with Bigger text beside the picked power's words
      under the cards. The intro fit playtest (every power, 3 sizes, both text sizes) passes;
      intro-picked-pic-390.png.
      2026-11-07 (F77, PR #136): Ping Pong (smash streak, the ball slowing on your side, a
      return bending away from the paddle), Penalty (a shot swinging wide and back, your keeper
      spreading wide, a fake ball beside the real one) and Snack Snatch (snacks drifting to you,
      slowing on your side, a snap reaching twice as far) have pictures too.
      2026-11-07 (F78, PR #137): and Tanks, Snake, Chop Chop, Quick Draw and Sea Battle, so
      every game with powers has a picture for each (unit test covers all 33; the how-to-play
      playtest checks every one shows and moves).
- [x] 2026-11-01 (PR #69): Penalty's demo showed only the shooter's swipe. New `kick` gesture
      loops both roles: swipe the ball, then the keeper's tap on a dive button.

## Ideas found 2026-10-31 (Sumo head start run)
- [x] 2026-11-01 (PR #71): Sumo with no head start: a masher still loses every match (self-outs).
      Now, after two losses in a row to an Easy bot (any game), the result screen offers the
      person "⭐ Want a head start?", one star per offer up to ★★★ (where a masher beats the
      easy Sumo bot 25–60% of the time). See the easier-offer item below.
- [x] The playtest monkey and the unit-test "masher" are two models of a mashing kid;
      share one masher model (tests/helpers) and reuse it for other one-button games
      (Chop Chop, Quick Draw) to measure whether a masher can ever win there.
      2026-11-08 (F134): the one model is `Masher` in scripts/simlib.ts (bursts of 0.08-0.6 s,
      gaps 0.05-0.5 s, a finger wandering its own half); Sumo's tests now use it too, and
      tests/masher.test.ts plays it in Chop Chop and Quick Draw (n=20, both seats): masher v
      easy 0%, masher with ★★★ v easy 0%, v hard 0% in both. So a head start doesn't help a
      masher there yet (F21's call). The playtest monkey stays separate on purpose: it drives
      real pointer events in the browser, the Masher drives game intents.
- [x] 2026-10-31: Checkers: the playtest's random taps never completed a move (the "later"
      screenshot was the opening position). Done with the item below.

## Ideas found 2026-10-31 (Sea Battle person run)
- [x] 2026-10-31: Checkers, Four in a Row and Tic-Tac-Toe now have a playtest person too
      (`boardPerson` in `playtest/person.ts`): it waits for the bot and the animations,
      picks a legal move and taps it the way the game asks (Checkers: the piece, then every
      landing square of a jump; Four in a Row: the column, in the mover's own half), and
      counts a move only when the board changes. The playtest now fails if the person makes
      no moves against the bot, or if either seat makes none in a two-player match (Sea
      Battle included), and the report shows moves per seat. Before: Checkers made 0 moves
      in 50 s of play. Now about 11+4, Four in a Row 9+5, Tic-Tac-Toe 14+6, Sea Battle 4+3.
      Playing it showed Four in a Row never buzzed on a drop (the disc landing played
      'bounce', which has no vibration): the landing now plays 'hit', so dropping a disc
      gives a short tick (0 → 18 buzzes in the playtest).
- [x] 2026-11-01: Sea Battle vs a bot: a kid couldn't see where the bot's shot went. The
      0.7 s "beat" before the hand-back was counted from the moment the bot fired, so with
      the 0.38 s shell flight the result stayed on screen for about 0.3 s. The beat now
      starts when the last shell lands and lasts 0.9 s on a miss, 1.6 s on a hit, 2.2 s on
      a sinking (`src/games/seabattle/beat.ts`); the cells it fired at get a pulsing ring in
      the bot's colour on your big fleet, and the header says what happened ("Player 2 hit
      your ship!", "… missed!", "… sank a ship!", "Look where it landed"). Unit tests pin the
      timings and titles; a new playtest plays a person against the hard bot for 30 s and
      checks every bot turn's result stays up that long after landing
      (`seabattle-bot-hit.png`).

## Ideas found 2026-10-31 (board person run)
- [x] 2026-11-07 (F116, dropped: Checkers is hidden and gets no work since 2026-11-01). Checkers vs the normal bot: the person (random legal moves) is down a few pieces within
      25 s; check the easy bot gives a kid who plays randomly a real chance (bot pace table).
- [x] 2026-11-07 (F116, dropped: Tic-Tac-Toe is hidden and gets no work). Tic-Tac-Toe never buzzes on a mark (marks play 'tap' / 'pop'); decide whether turn
      games should tick on each move like Four in a Row now does, or stay quiet.
- [x] Rock Paper Scissors could get a person too, so the report counts throws per seat.
      2026-11-07 (F133): done; `rpsPerson` (playtest/person.ts) plays RPS in "play like a
      person" and in the solo pass (F125), and its moves are counted per seat like Sea Battle's.

## Ideas found 2026-10-31 (colour-blind run)
- [x] 2026-11-01 (PR #68): COLORS.good (#4ade80) and COLORS.bad (#ff5c7a) were a red/green pair
      (0.09 for deutan). Good is now teal #5eead4 (0.16 apart for every vision, tested in
      tests/colors.test.ts); Penalty's saved/miss dots already add an X / dash.
- [ ] Game cards' own colours (`content/games.json` `color`) aren't checked; fine since the
      name and icon carry them, but a game that colours pieces by card colour would need it.
- [x] A shape per seat (e.g. a small ring vs dot on paddles, snakes, pieces) would make
      seats readable even in greyscale or bright sunlight, not just for colour blindness.
      2026-11-07 (F10, PR #98): `seatRing()` in src/engine/draw.ts: a white ring over a dark
      under-stroke round each piece, solid for the bottom seat and dashed for the top, in the
      games where both pieces roam the same space (Sumo wrestlers, Snake heads, Tanks). Air
      Hockey and Ping Pong paddles never leave their own half, so they don't need it. Playtest
      "seat cue" saves greyscale screenshots (seat-cue-<game>-grey.png).
- [x] 2026-11-07 (F40, PR #100): Seat cue legend. In Sumo, Snake Duel and Tank Duel
      (`"seatRing": true` in content/games.json) each person's name line on the intro and in
      How to play reads "◯ yours: solid ring" (bottom) / "dashed ring" (top), drawn like the
      ring itself. On the name line, not a new line, so the intro still fits a 320×568 phone.
      Playtest "seat cue: the intro tells each person" saves seat-cue-<game>-intro.png.

## Ideas found 2026-10-31 (easier bot run)
- [x] 2026-10-31: Air Hockey stall rule. A puck left on one side (idle player, toddler,
      phone set down, or a puck resting where nobody reaches) stalled the match forever.
      Like the 7-second rule on real tables: after 4 s in one half the puck gets a pulsing
      ring in that player's colour and a "Your shot!" pop on their side (upright for them);
      at 7 s the table's air blows it gently to a spot 90 units past the centre line (speed
      set from the friction so it stops there and never drifts into a goal), with a whoosh.
      If a paddle blocks it, it blows again 2.5 s later. A rally that crosses resets the
      clock. Logic in `stallRule()` (`held` on the game); unit tests pin the timing, the stop
      short of the goal, two idle players (no goals), and that an idle person vs any bot
      level always reaches a result. The playtest leaves the puck on a person's side and
      checks the nudge, the drift and the result (`airhockey-nudge.png`).
- [x] 2026-11-01 (PR #71): The easier offer suggests a head start star when the bot is already
      Easy. One tap sets the person's player-sheet stars; records carry each seat's stars
      (`heads`), so taking a star starts the two-loss count again.

## Ideas found 2026-10-31 (bot level run)
- [x] 2026-10-31: "Make the bot easier?" After a person loses 2 matches of one game in a
      row to the same bot level, their half of the result screen offers the bot one level
      down (Hard → Normal → Easy, never lower). One tap sets that game's level (same as the
      intro row), says "Bot is Normal now ✓", and Rematch uses it; other games keep theirs.
      A win, a draw or a level change resets the count; two people or two bots never see it.
      Match records now keep each seat's bot level (`bots`), `easierOffer()` in
      `src/app/store.ts` is unit tested; the playtest loses twice to a hard Snake bot on a
      320×568 phone, checks the offer fits, is 44 px+, and that the rematch and only that
      game use Normal (`easier-offer.png`). Finding: Air Hockey with an idle person never
      ends (the serve rests on their side and the bot can't cross), which is right by the
      rules but means a walked-away match runs forever.
- [x] 2026-11-07 (F43, PR #103): A game card shows a small 🤖 badge on its icon when that
      game's bot plays a level picked on its intro that differs from the player sheet's
      (ownBotLevel() in store.ts; "Bot level here: easy" for screen readers). Playtest "bot
      level" checks it and saves bot-level-home-badge.png.
- [x] 2026-11-07 (F44, PR #104): Intros are fit-checked on a tall phone (390×844, where the
      desktop-size how-to text shows) both with two people (layout test) and with a bot on
      top (bot level test, plus its 44 px target and font checks). Every intro fits; nothing
      needed fixing. Saves bot-level-intro-tall.png.

## Ideas found 2026-10-31 (air hockey stall run)
- [x] Other real-time games may stall with an idle player too (Ping Pong serve, Penalty
      shooter, Tanks): a playtest that idles one seat against a bot in every game and
      checks a result arrives within ~3 minutes would find them all.
      2026-11-07 (F91): covered: `npm run sim -- --idle` measures every real-time game with one seat idle, and Ping Pong, Penalty and Quick Draw have clocks (see "Idle-seat stalls" below).
- [x] 2026-10-31: Air Hockey bots scored on themselves. Ran every real-time game with one
      seat idle against each bot level (none stall now; Minigolf waits for its shot, as it
      should). Air Hockey stood out: an idle person beat the easy bot in 21 of 40 matches
      and the hard bot in 10 of 40, and the idle seat "scored" almost as often as the bot
      (142 vs 145 goals at easy). It wasn't the parked paddle: 9 in 10 of those goals came
      straight off the bot's own touch. When its paddle was on the far side of the puck it
      drove straight to the spot behind it, dragging the puck into its own goal, and it
      drove down onto pucks already between it and its goal. Now it walks around the puck
      (sideways first, then back past it), steps aside from a puck behind it, and clears a
      puck on its own back wall sideways. Idle person vs bot: easy 37/40, normal 40/40, hard
      39/40 bot wins; own goals per bot goal 0.98 → 0.60 (easy), 0.37 → 0.22 (normal),
      0.52 → 0.26 (hard). Bot-vs-bot matches last longer (normal vs normal ~60 s → ~2 min)
      and the skill gap is clearer (hard beats easy 38/40, was 32/40). Unit tests pin the
      idle-person results and the go-around.

## Ideas found 2026-10-31 (air hockey own goals run)
- [x] Air Hockey easy bot vs a real kid: with fewer bot own goals, a kid's free goals are
      gone. Check the playtest monkey's score vs easy and, if kids stop winning, slow the
      easy bot's paddle reaction rather than bringing the own goals back.
      2026-11-07: no change needed. `npm run sim -- --game airhockey --n 100`: a mashing kid
      wins 10% vs easy with no head start and 49% with the full head start (kid+3).
- [ ] The air hockey bot still concedes some goals off fast rebounds (it reacts to where
      the puck was 0.1-0.45 s ago). Fine and human-like; recheck if hard looks clumsy.
- [x] An idle-seat sim for every real-time game (this run's scratch script) could become a
      `npm run sim` table with the bot pace table idea above.
      2026-11-07 (F32): `npm run sim -- --idle` plays every action game with one seat that never
      touches the screen (`Idle` in scripts/simlib.ts) against each bot level. n=40: no game
      stalls (nothing unfinished at 5 min). Two findings, filed as tasks: the Sumo easy bot
      beats an idle player only 8% of the time (it dashes past and teeters itself out), and
      Air Hockey bots need ~2:15 to score 5 past a parked paddle (5-25% of matches over 3 min).
- [x] 2026-11-07 (F34, PR #97): Sumo bots beat a player who never presses. A foe who hasn't
      pressed for 2 s (their arrow never stops) is a still mark: every level then allows for
      its own delay and aims at least as well as normal (anticipation 0.7, noise <= 0.25,
      care 0.9). `npm run sim -- --idle --game sumo --n 80`: easy wins 8% -> 93%; kid+3 v easy
      stays 40% (target >= 25%), kid v easy 0%; bot-vs-bot rows and `sim:powers` unchanged
      (bots press all the time). No head-start change was needed.
- [x] 2026-11-07 (F35, PR #94): Air Hockey bots go round a parked paddle. Once the foe's paddle
      has stood still 1.5 s, the bot picks the line into the goal with the most room past the
      paddle and inside the posts (usually a bank off a side wall), and normal and hard line up
      a careful set shot (within 6 units, at most 1 s; easy takes its rough shot). Bot-vs-bot
      play is unchanged (the paddle is never still that long). `npm run sim -- --idle --game
      airhockey --n 40`: average match 131/140/134 s -> 109/123/53 s (easy/normal/hard), over
      3 min 13/25/5% -> 8/3/0%. What's left is the rules, not the bot: after every goal the
      walked-away player serves, so each goal waits the 7 s stall drift.
- [x] 2026-11-07 (F41, PR #101): Air Hockey's stall rule is quicker for a paddle that hasn't
      moved at all since the last goal (or kick-off): nudge at 2 s, drift at 4 s (was 4 / 7).
      Anyone who has touched their paddle since the goal keeps the full 7 s. `npm run sim --
      --idle --game airhockey`: avg 103/121/52 s -> 93/107/40 s, the normal row's one match
      over 3 min is gone. The nudge ring follows the same clock (AirHockey.stallTimes).

## Ideas found 2026-10-31 (contrast run)
- [x] 2026-11-01: Chop Chop's "◀ chop / chop ▶" hints faded to 45% opacity once play
      started (about 1.6:1 on the grass), right where a kid looks for which side to tap. They
      now sit on a small dark pill at full opacity the whole match (white on the pill is well
      over 4.5:1 on every grass shade). A unit test reads the hints from the source and checks
      them on the lightest grass, since the playtest's probe only judges a label at its best.
- [x] 2026-11-07: Menus (DOM) are contrast-checked: `playtest/domcontrast.ts` screenshots the
      page with every glyph transparent and judges each text run against the median pixel
      behind it (covered text skipped). The playtest "contrast: intro, pause and result text
      (DOM)" runs it on the intro (people, after Ready, vs a bot), the pause sheet and the
      result, with Blue/Pink and Mint/Orange. It found and fixed: white "Ready!" and bot level
      text on a light seat colour (2.4:1 on Mint, now `inkOn`), and the seat name on the
      intro half (4.3:1 on Pink, now lifted toward white). (F8)
- [x] 2026-11-07: The playtest only played Blue vs Pink; a new pass ("contrast: Mint vs
      Orange") plays every shown game with the lightest pair (two people for 5 s, then bots
      to the result) and fails on any label below WCAG contrast. Screenshots
      `snake-mint-orange.png`, `tanks-mint-orange.png`. It found four labels and they are
      fixed: Chop Chop "them: N" sits on a dark pill in white, Sea Battle's header sub-line
      ("Tap a square…", "Now pass the phone") is full white, and its "you"/"them" are drawn
      at full seat colour (PR #82).

## Ideas found 2026-11-01 (pop outline run)
- [x] 2026-11-07 (F51, PR #112): Extend the source check of `fx.pop` colours to every game against its own play
      surfaces (Quick Draw sand, Minigolf grass, Ping Pong table), so rare pops elsewhere
      are covered too; needs each view to export its surface colours.
- [x] Purple on the dark floor (#14112b) is about 4.2:1, so a small (15-16 px) pop in a
      Purple player's colour ("they used …" in Snake/Tanks) is below 4.5:1; the playtest
      only plays Blue vs Pink. Run one pass with Purple and Mint and give player-colour
      pops a lighter tint or a larger size.
      2026-11-07 (F31): small player-colour pops in Snake, Tanks and Quick Draw go through
      `popColor()` (src/engine/fx.ts), which mixes a colour toward white only until it reads
      at 4.5:1 on the floor (Purple becomes rgb(129,100,255); every other seat colour is
      unchanged). The Mint vs Orange playtest now also plays those three games Purple vs
      Mint; a unit test checks every seat colour.

## Ideas found 2026-11-01 (left-handed run)
- [x] Left-handed power buttons: most games put the power button in the player's left
      corner (free hand for a right-hander). Mirroring it for a lefty needs each game's
      opposite corner cleared first (Minigolf's Hole/Total, Air Hockey's score).
      2026-11-07 (F38): the player sheet's existing "Left-handed" (Tank Duel's stick/FIRE
      swap) now also moves the corner power button to that player's right corner in
      Minigolf, Air Hockey, Sumo, Ping Pong, Penalty and Quick Draw (`powerSpot()` in
      engine/widgets.ts). Minigolf's Hole / Total columns move left of it (name and status
      start at the left edge) and Sumo's name and round pips swap corners; Air Hockey,
      Ping Pong, Penalty and Quick Draw had that corner free. Snake, Snack Snatch, Chop
      Chop, Tanks and Sea Battle put the button in the middle or by the controls, so
      nothing changes there. Playtest "left-handed: corner power buttons..." (lefty-*.png).
- [x] 2026-11-01: Tank Duel: both FIRE buttons were the same red with a white edge, so two
      kids sitting close had only the button's corner to tell whose it was (the stick was
      already player-coloured). FIRE stays red (red means fire) but now sits in a 5-unit band
      of its owner's colour behind a dark gap (the floor colour), so Pink still reads as its
      own ring around red; the reload ring moved out past the band and the ammo pips moved
      up to clear it. `fireLook()` in `tanks/controls.ts` is unit tested (rim per seat, gap
      contrast against every player colour on ready and reloading buttons, fits the phone);
      the left-handed tank playtest samples both seats' bands in the canvas against their
      owner's colour (`tanks-left-handed.png`).

## Ideas found 2026-11-01 (Sea Battle beat run)
- [x] 2026-11-01: Sea Battle: your own shot's result now stays up long enough to see. The
      shooter's beat was counted from the shot, so after the 0.38 s flight a miss showed for
      ~0.9 s between two people (~0.4 s against a bot) before the turn moved on, and the
      header said "Missed…" before the shell had landed. With hit-again it was also wrong:
      after hit, hit, miss it said "Direct hit!" because it read the whole turn. Now the beat
      starts when the last shell lands (0.6 s on a miss, 1.2 s on a hit, 1.6 s on a sinking,
      +0.6 s when two people pass the phone), the header says "Fire!" while the shell flies,
      then names the shot that ended the turn, with "2 hits this turn" underneath
      (`shooterBeat` / `shooterResult` in `src/games/seabattle/beat.ts`, unit tested). A new
      playtest plays two people for 30 s and checks every turn's beat, header and the
      no-spoiler flight (`seabattle-pass-beat.png`).
- [x] 2026-11-01: Four in a Row rings the newest disc. Checkers already tints the last
      move's squares and Tic-Tac-Toe's 9 cells draw each mark in, but in Four in a Row a
      bot's disc landed in 0.6 s among up to 41 others with nothing to say which was new.
      Now the newest disc (a drop, a bomb's disc where it ends up, or the disc a flip
      turned) wears a pulsing white ring once it lands, until the next move; a block
      places no disc and leaves it. `FourInARow.last` is unit tested; the playtest plays a
      normal bot, checks its disc is ringed for 3 s while the person thinks and that the
      ring moves to the person's disc when they drop (`fourinarow-last-disc.png`).

## Ideas found 2026-11-01 (newest disc run)
- [x] 2026-11-01: Tic-Tac-Toe shows the newest mark. The bot marks 0.5-0.7 s after you, so
      in a fuller board a kid looking back had nothing to say which mark was new. Now the
      newest mark sits on a soft tile of its player's colour (a white ring like Four in a
      Row's would vanish on the cream paper) once it has drawn in, until the next mark; off
      between games, where the winning line takes over. `TicTacToe.last` is unit tested; the
      playtest plays a normal bot, checks its mark stays tiled for 3 s and that the tile
      moves to the person's mark (`tictactoe-last-mark.png`).
- [x] 2026-11-01: Checkers: a multi-jump now stays readable after it lands. Only the start
      and end squares were tinted, so after a bot's double jump a kid saw two of their pieces
      gone with nothing to say how. Now every square of the last move's path is tinted, a
      jump's path is traced (dashed, in the mover's colour) and each taken piece leaves a
      dashed ring with a white cross in its owner's colour, until the next move; an undo
      clears it. `moveTrail()` in `checkers/logic.ts` is unit tested; the playtest sets up a
      forced double jump for the normal bot, checks the path and both taken squares are
      drawn in the canvas, that they stay for 2.5 s, and that the marks move to the person's
      move (`checkers-double-jump.png`).
- [x] 2026-11-01: The waiting player sees who is thinking. Four in a Row's waiting side read
      "<name>'s turn" in small grey text with no pill, while Checkers and Tic-Tac-Toe said
      "Waiting…" even during the bot's pause, so a kid sat through it with nothing saying
      why (the bot's own "Thinking…" faces the other way). All three board games now give
      the waiting seat the same quiet pill: "🤖 Player 2 is thinking…" while a bot picks its
      move, "Waiting…" while a person does (`waitingLine()` in `core/turnline.ts`, sharing
      the countdown's name shortener). Long names shrink to fit the pill (`fitSize()` in
      engine/draw.ts, never below MIN_TEXT). Unit tested; a playtest plays each game against
      the normal bot on a 320×568 phone, checks the person's pill names the thinking bot and
      that no "'s turn" line is drawn (`<game>-bot-thinking.png`).

## Ideas found 2026-11-01 (Sea Battle hit-again run)
- [x] Sea Battle: with hit-again, a bot can chain 4-5 hits on your fleet in one turn; the
      bot-result beat shows the whole turn's total, but a kid may want each hit called out
      ("hit 3 times!" is there; maybe a small count badge on each new hit).
      2026-11-07 (F53, PR #114): once a turn has 2+ hits, each hit cell wears a gold badge
      with its number (1, 2, 3...) at its corner, upright for whoever looks, on the shot sea
      (the bot's chain on your fleet too); a new turn clears them. Playtest "a hit fires
      again" checks both badges by pixel and that the next turn starts plain.
- [x] 2026-11-07 (F116, already done in docs/rules.md: every game's familiar rule vs ours). Rules audit of the other classic games against the rules families know (Checkers
      forced jumps and kings, Four in a Row, Ping Pong serve every 2 points, Penalty 5 each
      then sudden death), listed in docs so a parent can check "is this the real rule?".

## Ideas found 2026-11-01 (text alpha run)
- [x] Other helpers that set `globalAlpha` to an absolute value (fx particles and flash,
      several games' `= 1` resets) would also cancel an outer fade; if a whole screen ever
      fades (e.g. a result transition), make them relative like the buttons.
      2026-11-08 (F136): fx (sparks, screen flash) now multiply the caller's opacity and hand
      it back (tests/alpha.test.ts). The games' own `globalAlpha = 1` resets stay: nothing
      fades a whole game screen today; make those relative too if a transition ever does.

## Ideas found 2026-11-01 (shooter beat run)
- [x] 2026-11-07 (F42, PR #102): Checked: Sea Battle's pops go through `this.pop`, which
      faces `viewer`, and the viewer in the fire and after-turn screens is the shooter
      (seabattle/index.ts `get viewer`), so "HIT!" and the new "3 hits!" read upright for the
      top player when they fire.
- [x] 2026-11-07 (F42, PR #102): A person's turn of 2+ hits (hit-again) ends with a gold
      "3 hits!" pop over the sea 0.3 s after the last shell lands, upright for the shooter,
      with the score chime; the result stays 0.6 s longer so it's read before the hand-over.
      Both vs a bot and between two people (turnTally() in seabattle/beat.ts). Playtest
      "a hit fires again" checks the pop and saves seabattle-turn-tally.png.

## Hidden games (Chris, 2026-11-01)
- [x] Checkers, Four in a Row and Tic-Tac-Toe are **hidden**, not deleted: board and thought
      games families already own, or have dedicated apps for, add little. They keep `"hidden":
      true` in content/games.json, so they have no home card but their code, logic tests,
      e2e bot-vs-bot run and their own playtest checks still run. Bring one back by deleting
      the flag; `/?all` shows every game for a quick look. With them gone the home groups are
      "⚡ Action games" and "🎲 Take turns" (Sea Battle, Rock Paper Scissors).
      **Don't spend improvement runs on hidden games, and don't add new board/thought games.**
      Ideas below that only touch hidden games are parked.

## Ideas found 2026-11-01 (home order run)
- [x] 2026-11-01: Home grid in labelled groups. On a 320 px phone only the first rows show,
      and the 15 cards were one unbroken grid, so a parent looking for a calm game had to read
      every card's small kind line. The grid is now three groups with a heading each:
      "⚡ Action games" (Minigolf and the free trio still on top), "🧩 Board games · take
      turns" (Sea Battle, Four in a Row, Checkers) and "🎁 Free extras". Groups come from each
      game's `kind` in content/games.json (`homeGroups()` in `src/app/homegroups.ts`, unit
      tested: the groups flatten back to the exact list order). The layout playtest checks
      the three headings show, each sits right above its own cards, and saves
      `home-groups.png` scrolled to the board games.
- [x] 2026-11-07 (F116, a closed note, nothing to do). Idle-seat stalls: Ping Pong serves itself, Penalty has a shot clock and Quick Draw a
      draw timeout, so the "idle player stalls the match" worry is covered for those; Tanks
      and Snack Snatch have match clocks. Only a turn game left waiting (Minigolf putt,
      Sea Battle shot) can wait forever, which is fine with a person there.

## Ideas found 2026-11-01 (minigolf pars run)
- [x] 2026-11-07: Minigolf: a hole-by-hole strokes table (easy / normal / hard, 12 seeds) as an
      `npm run` script, so a new hole gets its par and place in the list from numbers:
      `npm run golf` (avg strokes, aces, picked up per level; docs/verification.md). (F28)
- [x] Minigolf: the hard bot aces 9 of the 22 holes almost every time (Speed Bumps, Island
      Green, Bumper Bowl, Downhill Dash 12/12). Fine as "hard", but a hole where an ace needs
      a bank shot would give a strong grown-up something to chase.
      2026-11-07 (F55, PR #115): new par-3 hole "Bank Shot" (23 holes): a block sits on the
      line from tee to cup, so the only ace comes off the right wall. `npm run golf`: easy
      2.9 strokes (0% aces), normal 1.8 (17%), hard 1.3 (71%), none picked up. Unit tests:
      no straight ace, and every ace in an angle/power sweep banks off the right wall.
- [x] Minigolf: Twin Gates (easy 5.3, normal 4.2 strokes) and Switchback are long for a small
      kid with a 6-stroke cap; check the cap is hit rarely with the head start on.
      2026-11-07: checked (easy bots, 12 seeds; the head start doesn't change a bot's shots,
      only the net score): a flat cap of 6 picked up 71% of balls on Twin Gates (par 5) and
      13-21% on the par 4s. The cap is now 6 or par + 3, whichever is more (`Minigolf.cap`):
      Twin Gates 50%, Switchback 4%, Zig Zag 4%; the "Picked up · N" pop shows the hole's cap.
- [x] Twin Gates is still the one hole an easy bot can't finish half the time (6.6 strokes
      on par 5, picked up at 8 in 50%). Soften it (a wider gate) or move it out of a small
      kid's draw, measured with easy bots over 12 seeds.
      2026-11-07 (F127 sweep): done by F29 (gaps 100 -> 140, see the Twin Gates run below);
      `npm run golf -- --hole gates --n 24` now reads easy 5.2 strokes, picked up 8%
      (normal 3.1, hard 2.2), so both Twin Gates lines are closed.

## Ideas found 2026-11-01 (FIRE rim run)
- [x] The same owner-colour band could go on other shared-looking buttons: Penalty's and
      Snack Snatch's power buttons, and Quick Draw's two DRAW pads, if kids mix them up.
      2026-11-07: power buttons got it in F47 (PR #108). Quick Draw's pads need none (F74):
      each SQUIRT pad is filled with its owner's colour and sits in that player's own half.
- [x] Tank Duel's FIRE button could flash its band gold while a bouncy shell is loaded
      (the glow does this today, faintly on a light rim like Mint).
      2026-11-07 (F46, PR #107): the band blinks gold twice a second while a bouncy shell is
      loaded (gold a quarter second, then the owner's colour), `fireLook(..., bouncy, t)` in
      tanks/controls.ts. Playtest "tanks: a loaded bouncy shell blinks..." samples Mint's band
      and sees both, saving tanks-bouncy-band.png.

## Ideas found 2026-11-01 (newest mark run)
- [ ] A shared "newest move" look across the board games (Four in a Row ring, Tic-Tac-Toe
      tile, Checkers tint, Sea Battle's last shot) so a kid learns one cue for "what changed".
- [ ] Tic-Tac-Toe's ghost dots in empty cells only show for a person's turn; during the
      bot's think a faint "🤖 thinking" over the board would explain the pause to small kids.

## Ideas found 2026-11-01 (checkers trail run)
- [ ] Checkers: the "Taken" line under each panel could show the taken pieces as small
      discs (like captured pieces beside a real board), so a kid can count them at a glance.
- [ ] Checkers: the jump trail line is thin on a 320 px phone; if kids still miss a bot's
      jump, replay the last move's hops once (slow) when the person taps a ghost ring.

## Found 2026-11-07 (F61)
- [x] Minigolf's play-like-a-person row always warned "'Downhill Dash' / 'Bot 2 tees off first'
      was only seen fading in". Those were the bot-vs-bot match's first frames: the playtest
      fast-forwarded while the hole card was still fading in. It now waits (`settleFades`, up
      to 2.5 s) for the card to be fully shown first, so the words are judged at rest (they
      pass) and the warning is gone. PR (this one).

## Ideas found 2026-11-01 (Sea Battle first shot run)
- [x] The two-person look-away cover is the only Sea Battle screen no playtest checks for
      the opening line; a two-people match in the playtest could read it on the cover.
      2026-11-07 (F64): the playtest "with two people, the first look-away cover says who goes
      first" reads the cover's words off the canvas ("You go first!", the shooter's name, the
      look-away line) and saves seabattle-first-cover.png. It already said it; no app change.
- [x] 2026-11-07 (F116, dropped as F69: it would mislead, since Minigolf's tee-off moves by honour and Penalty alternates). Turn games could show a small "first" marker beside the starter's score for the whole
      match (like a serve dot in Ping Pong), so a parent glancing in mid-match knows too.

## Ideas found 2026-11-01 (rematch starter run)
- [x] 2026-11-01: The countdown says who goes first. Rematches swap the starter, but the
      only sign was each game's small turn line, so a kid who went second could think the
      app picked the other player again. Now, in every turn game that knows its first mover
      at the start (Four in a Row, Checkers, Tic-Tac-Toe, Penalty, Minigolf), the 3-2-1
      countdown shows "You go first!" on the starter's side and "<name> goes first" on the
      other, each upright for its reader (`starterLines()` in `app/starter.ts`, unit tested;
      long names are shortened). The rematch playtest reads both lines during each countdown
      and checks they match the game's first mover (`rematch-starter-countdown.png`).
- [x] 2026-11-01: The Checkers double-jump playtest failed about half its serial runs (main
      was red in `npm run verify`): it tapped the piece and its target with the same finger
      id back to back, and when both landed inside one frame the second replaced the first.
      It now waits to see the piece picked up before tapping where it goes, like a person.
- [x] Other playtests that tap twice in a row with one finger id (`__finger(77, …)` and
      friends) could hit the same race; a shared `tapThenWait` helper would cover them.
      2026-11-07 (F63): `tapWorld(page, id, x, y)` in playtest/monkey.ts taps like a person
      (down, 60 ms, up, then two frames); the seven hand-rolled tap helpers in the Sea Battle,
      Tic-Tac-Toe, Four in a Row, Checkers and RPS playtests use it.
- [x] 2026-11-01: Sea Battle says who goes first. It picks its first shooter only after both
      fleets are hidden, so the countdown said nothing and a rematch's swap of the first shot
      went unseen. Now the first turn opens with a gold "You go first!" pop over the sea and a
      "<name>, you go first!" header for the shooter; against a bot that opens, the person
      sees "<bot> goes first" (header "<bot> goes first…" while it aims). Between two people
      the look-away cover says "You go first!" instead of "Your turn to fire". It stops at
      the first shell fired (`openingLine()` in `seabattle/beat.ts`, unit tested with the real
      first shooter and a rematch starter). A new playtest plays two matches against the bot
      through Rematch and checks the pop and header for whoever opens each, and that the
      first shot swaps seats (`seabattle-you-first.png`, `seabattle-bot-first.png`).
- [x] Reviews also ask to pick their colour when playing a bot and complain hard bots feel
      like they "never lose" (RPS, Mini Golf) or copy your moves (Snake); check our hard RPS
      bot stays near 1/3 per throw against a patterned kid, and that the hard Snake bot never
      mirrors a player's path.
      2026-11-07 (Snake part): checked, it doesn't. `tests/snake-mirror.test.ts` plays a person
      with three steering habits against hard Snake (15 matches): the bot's head sat on the
      mirror of the person's (turned or flipped board) in 18 of 4311 cells (0.4%). RPS part open.
      2026-11-07 (F62, RPS part): checked, no change. The bot throws at random at every level;
      `tests/rps.test.ts` plays 400 matches of the hard bot against a kid who always throws
      rock, one who cycles and one who repeats their last throw: the bot wins 28-39% of rounds
      and 42-58% of matches against each.
      2026-11-07 (F91): RPS part done too (F62, tests/rps.test.ts: the hard bot throws at random vs a patterned kid). Colour: each seat's colour is already picked on its player sheet, bot or not.
- [x] 2026-11-01 (20:00 research run): Ping Pong shows where the ball landed. Reviews of
      another 2-player app still say "hard to tell whether the ball has landed yet"; ours
      only had a thin ring that faded as it grew for 0.5 s. Now each bounce leaves a spot on
      the table (tinted by spin: gold topspin, blue backspin, white flat) that stays until
      the ball is hit back, then fades in 0.3 s, and the landing ring is thicker with a dark
      edge so both read on the green (`pingpong/bouncemark.ts`). Unit tests play bot rallies
      and check every spot sits on the side that hits it back and is fully showing until
      then; a playtest watches a real-time rally and checks the same (`pingpong-bounce-spot.png`).
- [x] 2026-11-01 (same run): checked two more review complaints against our bots. "On Hard
      the snake mimics my actions": over 200 matches of a turning kid vs each bot level, the
      bot turned the mirrored way within 0.45 s of the kid on 12-15% of its turns (no level
      above Easy) and its head was near the kid's mirrored spot 3% of the time, so ours
      doesn't copy (separate start lanes already break the mirror). "Whoever goes first
      wins": in Penalty the first shooter wins 51% (easy), 54% (normal), 54% (hard) of 600
      mirrored bot matches; a small edge, like real shootouts, so no change.

## Ideas found 2026-11-01 (thinking pill run)
- [x] Sea Battle's header already names the aiming bot; Penalty and Minigolf (bot's shot)
      could use `waitingLine()` on the waiting side too, so every turn game reads the same.
      2026-11-07 (F91): Minigolf already uses it. Penalty has no waiting seat: during a bot's kick the person keeps goal ("Tap a button to dive!"), so nothing to add.
- [ ] Tic-Tac-Toe's "Game 1" card covers the board for a moment while the bot may already be
      thinking; check a kid doesn't tap through it and miss the bot's first mark.
- [x] 2026-11-01 (Chris: "should famiduel have a solo mode vs AI?" → build it): Play the bot.
      Every game already had an honest bot, but it hid behind Player 2's sheet. Home now has a
      "👫 Play together / 🤖 Play the bot" switch (`Store.setSolo`): the bot takes the top seat at
      its last level (Easy at first) and per-game intro levels survive switching back. Bot games
      keep their own tally (`soloNight`, home shows "You vs the bot"), so practice never lands on
      the family match night or tips the auto handicap between two people. The result screen's
      bot half reads "Bot wins / Bot lost". A playtest plays every game solo from the switch.
- [x] Air hockey "walks away" playtest failed once in a full `npm run verify` (no result after
      fastForward(600)) and passed in 4 reruns, alone and in the full playtest. Watch for flakes.
      2026-11-07 (F133): no repeat in the week of loop verifies since (it passed again on
      main tonight); closed. Reopen with the failing log if it comes back.
- [x] 2026-11-01: Solo: the bot is called "Bot". After "Play the bot" it borrowed the top
      seat's person's name ("Player 2", or a sibling's name like Mia) on the home chip, the
      intro, the result screen, in-game lines ("Mia is thinking…", "Mia goes first") and the
      saved history. `seatName()` in `app/store.ts` now names an unnamed bot "Bot" ("Bot 1" /
      "Bot 2" when two bots play a demo); a name typed on the player sheet while the seat is a
      bot is kept as that bot's own (`botName`), and the person's name comes back on "Play
      together". Unit tested; the solo playtest names the top seat Mia, then checks "Bot" on
      the chip, every intro and result, and "Mia" again after switching back.

      Four in a Row's player name (in the player's colour) got the dark pop outline: the
      contrast probe caught "Bot 2" in pink at 3.4:1 on the pink glow of the active panel.

## Ideas found 2026-11-01 (bot name run)
- [x] Other games print the name in the player's colour on a tinted panel; Sumo and Sea
      Battle already have an outline, but a shared `nameLabel()` would keep them alike.
      2026-11-07 (F75, PR #139): `nameLabel()` in engine/draw.ts (bold, the pop's 75% black outline).
      Sumo, Sea Battle's cover and Rock Paper Scissors (secret pick line, name under the
      hand) draw names through it; Sea Battle's and RPS's outlines were 35-40% black. A text
      test fails on a player name drawn with a hand-rolled outline, and the small-text test
      also reads nameLabel sizes. Minigolf's names sit on dark cards via liftOn (unchanged);
      the hidden board games are left as they are.
- [x] Bot names with character: each bot level could have a friendly name and face (e.g. a
      sleepy robot for Easy) so a kid knows which one they are beating, without new words.
      2026-11-07 (F73, PR #134): faces, no new names: Easy 😴, Normal 🤔, Hard 😎
      (`BOT_FACES` / `botFace()` in app/store.ts; none is the person's 🙂). Shown on the intro's
      level buttons ("😴 Easy") and the seat's name line ("Bot 🤖😴", follows a new pick), the
      home player chip (its dot and "🤖 😴 easy"), the player sheet, the result's name line and
      the "Bot is 😴 Easy now" confirmation. Playtests check the buttons, the name line, the
      chip and every solo intro and result.
- [ ] Saves from before this change that named a bot on the sheet now show "Bot"; harmless
      before launch, but a save migration would be needed after.

## Ideas found 2026-11-01 (home groups run)
- [x] 2026-11-07 (F116, dropped: home has two groups now (Action, Take turns) and the board games are hidden). The group headings could be tappable chips at the top of home ("Action · Board ·
      Extras") that scroll to their group, so the board games are one tap away on a small
      phone.
- [x] The home screen (DOM) is still not contrast-checked (`domContrast(page, '#home')` would do it, in light and dark theme); the headings use `--dim` (62%
      white on #14112b, about 7:1), but a probe over all menu text would catch a regression.
      2026-11-07 (F91): done: playtest "contrast: home and settings text (DOM) in light and dark theme" judges all of home (scrolled through) and settings.

## Ideas found 2026-11-01 (Chop Chop hints run)
- [x] The contrast probe keeps a label's best at-rest sample and treats any alpha below 0.99
      as a fade, so a label drawn at a steady low opacity during play is never judged. A
      "steady" rule (same alpha for ~1 s counts as at rest) would catch the next one; check
      it doesn't flag real fades (Ping Pong tips, Snack Snatch banners) first.
      2026-11-07 (F81, PR #141): `atRest()` in engine/draw.ts: a label held at the same opacity
      (within 0.01) for 1 s counts as at rest and is judged; opacity under 0.3 never does
      (a fade's ends, or a card held at its start: Minigolf's hole card and "tees off first"
      read 1.0:1 that way on the first try). Every "play like a person" game and the Mint
      vs Orange pass still pass with it, so no steady faint label exists today. Unit tests.

## 2026-11-01 Air Hockey bot motion (Chris: "super spazzy")
- [x] Measured first (`src/core/motion.ts`): every level flipped direction ~9×/s and
      twitched ~7×/s, snapped harder than a finger on ~30% of frames, wobbled ~45% of the
      time. Causes: the paddle teleported toward a target that changed every frame (mode
      ping-pong between behind/push/around/aside, noise re-rolled every 0.4 s into the aim,
      defend tracking every wall bounce). Fix: a hand (`HAND` in logic.ts: eased target,
      acceleration-limited finger, same speed cap as a person), a committed shot (one aim per
      approach, run-up, push, short recover), latched sides for walking round / stepping
      aside, and a goalie that moves to where the puck will cross instead of shadowing it.
      Now ~2 flips/s, ~0.3 twitches/s, no harsh snaps. Levels are more clearly ordered
      (hard beats normal ~4 in 5) and own goals vs a still player fell; matches run longer
      (blocks are softer, so more stall-rule drifts against an idle player).
- [x] 2026-11-01: Ping Pong bot motion. The motion check found few flips or twitches but
      8-9% harsh frames at every level: the paddle jumped from still to full speed, or
      reversed, in one frame each time the ball changed direction, because the bot steered
      straight at each new target. It now moves a virtual finger (`HAND` in
      pingpong/logic.ts): keeps pace with a planned swing, brakes as it arrives, accelerates
      no harder than 12000 u/s² (22000 snapping into a drive or smash). Harsh frames 0.4-1.7%,
      flips 0.9-1.7/s, wobble 6-12%. Strength unchanged over 200 bot-vs-bot matches (easy beats
      normal 8% (was 2%), normal vs hard 0%, smashes and drives as often). Unit tests in
      tests/pingpong-motion.test.ts; `npm run motion` prints both games.
- [x] 2026-11-01: Tank Duel bot motion. A tank turns at a capped rate, so it can't snap like a
      paddle; the stick-game measure is a *wag*: turning one way, then straight back within
      0.35 s (`src/games/tanks/motion.ts`, in `npm run motion`). The bot wagged 0.43 (easy),
      0.72 (normal) and 1.13 (hard) times a second, mostly while lining up a shot (it re-rolled
      its aim wobble on every look, every 0.2 s for hard) and after each shot (it turned away
      to drive, then turned back for the next shot 0.2-0.6 s later). Now it keeps one wobble
      per shot and holds its aim after firing until its next look: wags 0.22 / 0.22 / 0.33 per
      second, turn reversals 1.7-2.4 → 1.2-1.4 per second. Strength over 100 mirrored-seat
      matches each: normal beats easy 98 (was 99), hard beats normal 87 (was 94), hard beats
      easy 100 (100); matches ~20% longer (normal vs normal 62 s, was 50).
      `tests/tanks-motion.test.ts` holds every level under 0.45 wags/s (fails on the old bot).
- [ ] Sumo is one button with dash physics (tap gaps already capped in bot-limits), so the
      motion check doesn't apply; Snake moves on a grid (turn gap = tapGap). Snake could get a
      "turns per second" check if a kid calls it twitchy.
- [x] 2026-11-01 (19:00 run): Tank Duel bot routes. The route was a breadth-first search
      where a diagonal step cost the same as a side step, so of the many equally short
      routes it took whichever the search order found, a different one from each spot, and
      zig-zagged across open floor. Now diagonals cost √2 (routes run straight with one
      bend), and among equally short routes the bot keeps the one it is already driving,
      then the one that needs the least turning from where it faces. It also holds its aim
      for one look when a shot blinks out of view (the other tank edging past a block
      corner) instead of turning away to drive and straight back. Over 30 seeds a level:
      wags 0.19 → 0.16 (easy), 0.21 → 0.20 (normal), 0.32 → 0.30 (hard) a second; turn
      reversals down ~5%. Strength over 100 mirrored-seat matches: normal beats easy 98
      (was 99), hard beats normal 91 (88), hard beats easy 100 (98), normal vs normal 50.
      `tests/tanks-route.test.ts`.
- [ ] Most of the hard bot's remaining wags (~0.3/s) come from switching between aiming
      and dodging or driving: it turns 90° to sidestep a shell and back to shoot. A person
      does that too; only worth softening if a kid calls the hard tank twitchy. Picking the
      dodge side that needs less turning was tried and made no measurable difference.
- [ ] Easy bot still scores own goals off rebounds of its own shots (0.45 s reaction);
      fine for a kid's opponent, but watch it in playtests.

## Ideas found 2026-11-01 (ping pong landing spot run)
- [ ] Hard Snake turns about 3× as often as Easy/Normal (it re-plans territory every cell);
      fine for strength, but if a kid calls it twitchy, a "turns per second" motion check
      like Tanks' wag measure would show it.
- [x] Penalty's first shooter wins ~54% between equal bots. If families feel it, an ABBA
      order (A, B, B, A...) is the known fix in real shootouts; measure before changing.
      2026-11-07 (F95): no edge now. Each seed played twice with the starter forced to each
      seat (n = 1,200 matches a level): first shooter wins 50.2% (easy), 51.3% (normal),
      50.8% (hard); bottom seat 48-51%. Within noise (+-1.4%), so ABAB stays.
- [x] Air Hockey has no landing problem, but Snack Snatch's thrown snacks could show a
      short ground shadow too if kids misjudge where they come down.
      2026-11-07 (F93): no change needed. Snack Snatch's snacks never leave the blanket: the
      pot shoots them flat and they slide and bounce in the plane (logic.ts moveSnack, no
      height), so there is no landing spot to mark.

## Found 2026-11-01 23:21 PT run
- [x] 2026-11-02 (PR #76): The "ping pong: where the ball landed stays" playtest failed main's
      verify, and 2 runs in 3 on its own: a fast ball's last stretch after the bounce is shorter
      than the test's 150 ms look, so no landing got checked. It now samples every frame in the
      page for 8 s and checks each landing from the frame it appears until the hit back or the
      point ends (held, in place, fully showing after its 0.08 s pop-in).
      Same PR: the air hockey "never moves, at any level" unit test (~5 s alone) timed out at
      vitest's 5 s default with two verifies running; it now has the 60 s whole-match timeout.
- [x] 2026-11-07 (F109, no change needed): Power balance with people in mind: the bots almost never jump the gun or bonk, so
      `npm run sim:powers` undervalues forgiving powers (Quick Draw Double Shot / Fake-out,
      the old Chop Chop shield). A human false-start / mistake rate per bot level would make
      the table closer to what families feel. Already covered: Quick Draw bots jump the gun
      per level (F20, `jump` 10/4/1%) and Chop Chop bots step into branches (`mistake`
      3/0.8/0.2%), so the sim already plays those slips; no `--slips` switch needed.
- [x] 2026-11-02 (PR #78): `npm run sim` has "kid v easy" and "kid+3 v easy" rows for every action
      game: a small kid who just mashes (`Masher` in scripts/simlib.ts, the sumo test's masher
      for every game), with no head start and with the full one. First read (n=20): with the
      full head start the kid beats easy only in Air Hockey 40%, Sumo 35%, Snack Snatch 15%,
      Snake 5%; 0% in Ping Pong, Quick Draw, Tanks and Chop Chop (no head start: 0-5%).
- [ ] Head start for a mashing kid: Ping Pong, Quick Draw, Tanks and Chop Chop give a mashing
      kid with the full head start 0% against the easy bot (`npm run sim`). Decide per game
      whether that is fine (a kid who plays at all does better) or the head start should
      cover mashing too (e.g. Quick Draw forgives early taps at assist 3).

## Ideas found 2026-11-07 (rules check run)
- [x] 2026-11-07 (F33): docs/rules.md lists, per shown game, the rule families know and what
      FamiDuel does. No mismatches: Ping Pong (to 7, deuce serve rule kept), Air Hockey (to 5)
      and Sumo (best of 3) are shortened, everything else plays the familiar rule.
- [ ] A "long match" setting (Ping Pong to 11, Air Hockey to 7) if families ask for full-length
      games; rules stay the same.

## Ideas found 2026-11-07 (home contrast run)
- [x] 2026-11-07 (F30): Home and settings (DOM) text is judged in light and dark theme by a new
      playtest (every screenful of home, then settings). It found white game names on light
      cards at 2.2-4.2:1 (Quick Draw yellow worst). Each card name now takes `cardInk()`
      (src/app/cardink.ts): dark or white ink, whichever reads better on the gradient shade
      actually behind the name; Ping Pong's card is a touch deeper (#ff5c7a → #f25070) so its
      white name passes. A unit test holds every card at 4.5:1. The test waits for the neon
      "Duel" to switch on before judging it.

## Ideas found 2026-11-07 (Twin Gates run)
- [x] 2026-11-07 (F29): Twin Gates' two gaps were 100 units wide with a slider and a windmill
      in them, so easy players were picked up at the cap (8) in half their holes. The gaps are
      now 140 (walls end at 110 / start at 250); slider, windmill and sand stay.
      `npm run golf -- --hole gates --n 60`: easy 6.6 → 5.4 strokes, picked up 50% → 10%;
      normal 4.6 → 3.3; hard 2.6 → 2.2. Par stays 5 (par 4 would cap at 7 and pick easy
      players up 18% of the time).
- [ ] Twin Gates is now easier than Switchback for normal and hard bots (3.3 vs 3.8): if hole
      order should stay easiest-first, swap them in `content/minigolf-holes.json`.
      2026-11-07 (F101, dropped): n=24 reads easy 5.2 vs 5.5, normal 3.1 vs 4.0, hard 2.2 vs
      3.0, but the list is ordered by par (tests/minigolf.test.ts: pars never go down) and
      Twin Gates is par 5. Swapping needs Twin Gates at par 4 (cap 7 picks up easy players
      ~18%), so it's a par call, left as is.

## Ideas found 2026-11-07 (waiting line run)
- [x] 2026-11-07 (F26): Minigolf's waiting strip said "Wait · Bot shoots" for the whole bot
      turn, so its lining-up pause read like a stuck game. It now shows the board games'
      `waitingLine()` ("🤖 Bot is thinking…") while a bot lines up, and "Wait · <name>
      shoots" otherwise; playtest `minigolf-bot-thinking.png`. Penalty needs no line: both
      seats act on every kick (shooter swipes, keeper dives), so nobody waits.

## Ideas found 2026-11-07 (bot levels run)
- [x] 2026-11-07 (F39, PR #99): Penalty, Sea Battle and Minigolf now test the middle bot step
      too (normal beats easy >= 60%, hard beats normal >= 55%, seats swapped, n=20). Today:
      Penalty 95% / 80%, Sea Battle 80% / 85%, Minigolf 95% / 90%. Follows F36's
      tests/bot-levels.test.ts for the 8 sim games.
## Ideas found 2026-11-07 (store reviews run)
- [x] 2026-11-07 (F36, PR #95): a rival 2-player app's reviews say its "stronger bot doesn't seem
      more powerful". `tests/bot-levels.test.ts` now checks the middle step in all 8 action
      games with the `npm run sim` matches: normal beats easy >= 75% and hard beats normal
      >= 60% (today 90-100% and 70-100%, Sumo lowest). Every level is a real step today.
- [x] (done in F39, PR #99: tests/bot-levels.test.ts checks normal v easy and hard v normal for them) Penalty, Minigolf and Sea Battle aren't in `scripts/simlib.ts`, so only hard v easy is
      tested for them; add the normal step there too (Minigolf: strokes per level from
      `npm run golf` already go easy > normal > hard).
- [x] 2026-11-07 (F49, PR #110): Sumo's push button label takes dark or white ink by the button's own
      shade and "LET GO" is 19 px bold (white on Mint was 4.3:1, so the Mint-vs-Orange contrast
      playtest failed whenever someone was holding). tests/contrast.test.ts checks every seat colour.

## Ideas found 2026-11-07 (minigolf card ink run)
- [x] 2026-11-07 (F48, PR #109): the playtest summary warned "Bot 2 tees off first" was
      only seen fading in. Checked by hand: in Purple that line (14 px) was about 3.5:1 on the
      hole card, and "<name>'s shot" (17 px) the same on its banner. Both now go through
      `liftOn(colour, card)` (engine/fx.ts, the general form of popColor), tested for every
      seat colour on both cards over white, grass and the floor; the Purple-vs-Mint contrast
      playtest now plays Minigolf too, which also caught each player's name on their bottom
      strip (17 px, 4.3:1 in Purple): lifted the same way.
- [x] (F50, PR #111) Other words drawn in a player colour on a see-through card (search `players[..].color`
      next to an rgba card) could get the same `liftOn` check.

- [x] 2026-11-07 (F50, PR #111): other words in a seat colour on a see-through layer, checked by hand
      with labelContrast for every seat colour: only Ping Pong's "SERVE" hint (14 px, black
      0.75 outline on the green table) was short, Purple at 4.0:1; it now goes through
      `liftOn(colour, SERVE_OUTLINE, TABLE_GREEN)`, tested. Sumo's corner names, Snake and
      Chop Chop's 22 px messages and Sea Battle's "them" already pass.
- [x] 2026-11-07 (F51, PR #112): every action game's view exports `SURFACES` (the colours its play area
      is painted in) and tests/contrast.test.ts reads each of its `fx.pop` calls against them
      (10 games). It found Quick Draw's "they used <power>" (15 px) on the sand in Purple at
      3.0:1 and Pink at 4.1:1; it now goes through `seatPop()` (popColor, then liftOn on both
      sands). Pops passed through a helper's own `color` argument are skipped.
- [x] 2026-11-07 (F52, PR #113): the pop check also reads pops passed through a helper's own
      `color` (Sea Battle's pop(), Ping Pong's popBoth(), Minigolf's and Penalty's both()) at
      each caller, with the caller's size; it fails if a pass-through helper isn't found.
      Sea Battle now exports SURFACES (deep sea and grid water) and is checked too. No faint
      pop turned up.

## Ideas found 2026-11-07 (power band run)
- [x] 2026-11-07 (F47, PR #108): every power button (the shared `PowerButton` in
      engine/widgets.ts) has a 2.5-unit band of its owner's colour round its dark backing, so
      it reads as "mine" with an empty meter too (the FIRE rim idea, for Penalty, Snack Snatch
      and every other game). Playtest "power buttons: each wears a band..." samples both
      seats in Penalty, Snack Snatch and Air Hockey.
- [x] Quick Draw's two DRAW pads: no band needed, each SQUIRT! button is already filled with
      its owner's colour (quickdraw/index.ts drawButton).
- [x] 2026-11-07 (F65): the canvas contrast probe also runs in the Bigger text playtest (every
      shown game, people at 320x568 then bots to the result at 390x844). All words pass with
      the switch on; the test also fails if the probe saw no words for a game.
- [x] 2026-11-07 (F67): the layout playtest scrolls #home (the home scroller), not the window,
      so bigtext-home-320.png and home-groups follow-ups show the top of home. The fixed
      screenshot showed "Play the bot" cut off at the right at 320 px with Bigger text (F71).
- [x] 2026-11-07 (F71): home's "Play together / Play the bot" switch wraps its labels onto two
      lines when they don't fit (Bigger text at 320 px pushed "Play the bot" past the pill).
      The layout playtest fails on a mode label past its button or the pill.
- [x] 2026-11-07 (F66): on short phones (and with Bigger text) picking a power pushed the intro
      out of its half: the picked card's description stretched the whole card row, cutting
      the title and the seat line (up to 85 px over at 320x568, 95 px with Bigger text at
      360x640; the layout playtest only checked before a pick). Cards now show names only
      there; the Ready button reads "Tap a power to see it" until a pick, and the picked
      power's description takes the how-to's place under the cards. A playtest picks every
      power in every shown game at 320x568, 360x640 and 390x844, with and without Bigger text.
- [x] 2026-11-07 (F79, PR #138): Reduce motion. With the phone's "reduce motion" on, the power pictures
      (SMIL, which CSS can't stop) pause on the frame 1 s into their loop (`watchPowerPics()` in
      app/powerpic.ts, a MutationObserver that freezes each picture as it appears, and sets
      them moving again if the setting is turned off), the camera no longer shakes
      (`reducedMotion()` in engine/calm.ts, checked in `Fx.shake`), and the ghost finger was
      already still in CSS. Playtest "reduced motion: ..." checks the picture is paused and
      looks the same 0.7 s later (reduced-motion-intro.png); unit test for the shake.
- [x] 2026-11-07 (F82, PR #142): Reduce motion also softens full-screen flashes (goals, hits): with
      the phone's setting on, `Fx.flash` draws at a quarter of its brightness, so it still
      says something happened without a strobe. Unit test in tests/calm.test.ts.
- [x] 2026-11-07 (F89): in-game canvas buttons measured on a 320x568 phone. Every Button in
      play (power buttons 57 px touch area, Penalty dive 64, RPS 89, Snack Snatch 103, Sumo
      HOLD 117) is a 56 px or bigger target; playtest "layout: every in-game canvas button is a
      56px touch target" walks each shown game's view for Buttons and fails a smaller one.
      Tanks FIRE (a 100 px zone plus its side of the strip) and Sea Battle's cells (F58) aren't
      Buttons and have their own checks. So Little hands (F83) only needs to grow drawn size.
- [x] 2026-11-07 (F83): Little hands reaches the games. With Settings > Look > Little hands on,
      in-game power buttons are drawn bigger (radius 22 -> 26 world units, icon with it) as far
      as the screen edge allows, with the same 57 px touch area; the settings line now says
      "in games too". The canvas-button playtest runs every shown game with it on and fails a
      power button that runs off the screen (unless it already did at normal size: Ping Pong)
      or overlaps another canvas button; screenshots little-hands-*.png. Unit test
      tests/littlehands.test.ts.
- [x] 2026-11-07 (F92): Little hands also grows Penalty's dive buttons (radius 28 -> 32, same
      64 px touch area) and Tank Duel's FIRE (34 -> 38; its touch zone was already the outer
      strip). Sea Battle's Ready is already 140x58 and its cells are tapped, so nothing there.
      The canvas-button playtest checks both grew, dive buttons don't touch, FIRE stays on
      screen (little-hands-penalty.png, little-hands-tanks.png).
      2026-11-07 (F97): the dive arrows grow with their button (x r/28), so a big button doesn't
      keep a small arrow.
- [x] 2026-11-07 (F88): Minigolf seat check per hole. No seat edge: the same seed with the
      seats swapped plays the same strokes mirrored (new test in tests/minigolf.test.ts, all
      23 holes). A first sim's "bottom seat wins 40%" followed which seeds it started on
      (flipping them flipped it to 60%). Teeing off first wins ~53-55% of decided holes
      between normal bots (n ~300, two seed ranges); small, and the honour rule gives it to
      the leader as in real golf, so no change.

## Ideas found 2026-11-07 (sim seed run)
- [x] 2026-11-07 (F102): `pairing()` (scripts/simlib.ts, used by `npm run sim` and
      `npm run sim:powers`) swapped seats on alternate seeds, so a seed that favours one seat
      (Quick Draw's wait, a spawn) was counted for whichever power sat there: Quick Draw rows
      summed past 100% (Slow Time beat none 85% while none beat Slow Time 70%; Slow Time read
      83%). Now every seed is played both ways round; tests/sim-pairing.test.ts checks a pair
      read from either side adds up. Re-read, n=40, normal bots: Quick Draw Slow Time 61%,
      Double 47% (were 83% / 70%); Ping Pong Smash 64%, Slow-mo 37%; Air Hockey Split 63%.
      Outliers left: Tanks Shield 73% (beats every power), Snake Phase 69%, Chop Chop Freeze
      69% / Double 70% (only because "none" loses 90%; one on one they are 48-65%).
- [x] 2026-11-07 (F103): Tanks Shield 73% with the fixed sim. Shorter didn't help (2 s 69%,
      2.5 s 71%): the bot (or a person) pops it as a shell comes, so it saved a bonk AND let
      you shoot back. Now your cannon rests while the bubble is up (FIRE greys out; a tap in
      its last 0.15 s is buffered as usual). n=60, normal bots: Shield 43%, Bouncy 57%, Mine
      46%, none 54%; no outliers. Test in tests/tanks.test.ts.
- [x] 2026-11-07 (F104): Snake Phase 68% with the fixed sim. Shorter didn't help (2 s 67%,
      3 s 68%): the bot (or a person) fires it when boxed in, and a crossing ran on through any
      number of trail cells in a row, so it tunnelled out through a packed block, or slid
      along a trail. Now one crossing passes at most 2 trail cells (RULES.phaseCells; a trail
      is 1 cell wide, so crossing a trail or two side by side still works). n=60, normal bots:
      Phase 59%, Bomb 56%, none 54%, Boost 31% (Boost is F12, Chris's call). Test in
      tests/snake.test.ts.
## Ideas found 2026-11-07 (palm run)
- [x] 2026-11-07 (F100): A palm resting in your half no longer takes the paddle in Air Hockey
      and Ping Pong. Both used the first finger down until it lifted, so a hand resting on the
      phone's edge before the match froze the paddle there. Now `Input.steering()` picks the
      seat's finger that moved last (3 world units counts as a move, so a palm's jitter
      doesn't); a fresh landing counts as 12 frames old, so a finger playing now keeps the
      paddle when a palm lands, and a finger that lands after a resting palm takes it.
      tests/palm.test.ts; playtest "a palm resting in your half" (palm-airhockey.png,
      palm-pingpong.png) failed on main (paddle stuck at the palm, x 110).

## Ideas found 2026-11-07 (easy-level Ping Pong run)
- [x] 2026-11-07 (F107): Ping Pong Smash won 70% between easy bots (85% vs no power; normal
      63%). The smash return now flies at 640 (was 780; serve 380, +34 a hit, cap 760), so
      it is still a jump in an early rally but a ready paddle reaches it. n=60: Smash 62% easy,
      53% normal, 50% hard; Slow-mo 39-42% and Curve 56-59% unchanged. Test in
      tests/pingpong.test.ts.
- [x] 2026-11-07 (F111): Ping Pong Smash does nothing late in a long rally (the ball is already past 640, up to
      760); if people notice, make it "+X over the current speed" and re-measure. Now Smash
      is at least 640 and at least 60 over the rally's speed (820 at the 760 cap). +120 read
      67% at easy; +60 reads easy 60%, normal 55%, hard 48% (n=80; was 62/53/50).

## Ideas found 2026-11-07 (easy-level power run)
- [x] 2026-11-07 (F106): `npm run sim:powers -- --level easy` (the level families with small
      kids play) had Snack Snatch Sticky at 91% (100% vs no power). Honey held snacks rolling
      away from you 2.5× harder, so they never reached the other side. Now honey slows a snack
      the same both ways and lasts 2 s (was 3). n=80: easy Sticky 63%, Magnet 48%, Double 55%;
      normal 40% / 53% / 63%. Shorter alone (1.5 s: 77%) or a smaller honey zone (stronger,
      the bot times it better) didn't fix it. Test in tests/snacksnatch.test.ts.
- [ ] Snack Snatch at hard: Sticky 26%, Double 73% after F106 (main read 49% / 63%); hard is
      rarely a kid's level, but a stronger pull for Sticky only at hard speeds could fix it.
- [x] 2026-11-07 (F105): Tank Duel's stick follows the thumb that steers, not a palm resting
      in the stick zone: Input.holding() keeps the finger holding the stick while it is down
      (so a thumb holding still isn't robbed by a palm that lands), and hands it to another
      finger that is steering more recently once that one moves, or at once if the holder never
      moved (a palm that landed first). Zones are judged where a finger landed. tests/palm.test.ts
      and playtest "tanks: a palm resting in the stick zone" (palm-tanks.png), which failed on
      main (stick stuck at the palm). Sumo/Snack Snatch taps count any finger, so a palm there
      is harmless.

## Ideas found 2026-11-07 (18:18 run)
- [x] 2026-11-07 (F98): Minigolf's hole card on today's course reads "📅 TODAY'S COURSE ·
      HOLE 1 OF 3" (gold, both seats, upright for each), so a rematch never hides which mode
      you're in; the daily playtest reads it once the card has faded in.
- [x] 2026-11-07 (F108, no change needed): Snack Snatch Magnet after F106 is in band: easy
      48% (60% vs Sticky, 53% vs none), normal 53% (`sim:powers -- --game snacksnatch --n 80`).
- [x] 2026-11-07 (F99): Today's course has at most one long hole (par 4+: Sand Castle,
      Windmill, Zig Zag, Switchback, Twin Gates; an easy bot takes 4.3-5.3 strokes on each).
      Over the next 365 days the old picks stacked two long holes on 36 days and three on
      2; now 158 days have none and 207 one. A second long hole drawn is put aside and drawn
      again, so days with one or none keep their holes. `tests/daily-golf.test.ts` pins it.
- [x] 2026-11-07 (F113): Tournament swaps. App Store reviews of a rival 2-player app ask to
      "veto" tournament games. Before game 1 each of the 7 lineup games is a button (↻):
      a tap swaps it for the next action game not in the lineup (tap again to keep
      cycling), up to 3 swaps; the 7 stay different and the first draw extra never repeats
      game 7. `swapGame()` / `swapsLeft()` in src/core/tournament.ts, tests in
      tests/tournament.test.ts, playtest "tournament: games can be swapped out" at 320 px.
- [ ] Rival app reviews say the hard bot "never loses" in Minigolf and RPS. Measured (F114,
      2026-11-07, 60 random 3-hole matches, seats swapped): hard Minigolf beats normal 88%
      (draws 8%) and easy 100%; normal beats easy 87%. Hard aces 94-100% of most par-2 holes
      (`npm run golf`), so a grown-up rarely beats it. RPS hard throws at random (F62). Fine
      for "Hard", but if families call it unbeatable, soften hard's aim on short holes.

## Ideas found 2026-11-07 (19:17 run)
- [x] 2026-11-07 (F115): The e2e bot-vs-bot tournament test now swaps game 1 before
      playing (F113): the swapped-in game is new to the lineup, the other 6 stay, "2 swaps
      left", Play and the intro name it, a quit game keeps the swaps, they end once game 1
      is played, and the finished lineup still shows it first.
- [x] 2026-11-07 (F116): Backlog sweep: seven stale open lines ticked with why (kid sim rows
      and the rules audit were already done; Checkers / Tic-Tac-Toe / home-group chips dropped
      as hidden board games; the "first" marker dropped as F69; the idle-seat note closed).
- [x] 2026-11-07 (F117): Playing the bot, its half of the intro and result was turned 180°
      like a person's, so the one real player picked the bot's level and read "Bot wins"
      upside down. A bot's half now faces the person when the other seat is a person
      (`.half.faces`); two bots or two people keep the usual halves. Playtests check the
      bot half's transform on every solo intro and result and on the bot-level intro.
- [x] 2026-11-07 (F118): The in-game canvas still drew the bot seat's labels (countdown,
      scores, banners, pops) upside down for a solo player. With one person at the table,
      `text()` now turns every word that would read upside down for them about its own
      anchor (flipping left/right alignment so it keeps its place), judged from the canvas
      transform, so words inside a turned half or a turned view are caught too
      (`setReader()` / `soloReader()` in engine/draw.ts, set by the runner each frame).
      Pictures, arrows and buttons keep their seat. Solo playtest checks every shown game
      turned the bot's words and none runs off the screen (`solo-play-<id>.png`).
- [x] 2026-11-07 (F119): Playing the bot, the bot's half still showed how-to words nobody
      reads: Snake's "Tap ◀ ▶ to turn", Chop Chop's chop pills, Ping Pong's SERVE when the
      bot serves (Penalty and Ping Pong's swipe hints already skipped bots). The solo
      playtest fails if any of them is drawn for the bot seat.
- [x] 2026-11-07 (F121): A seat's own bot level lets the person sit at the top with the bot
      below. New playtest plays Air Hockey, Sumo, Snake and Minigolf that way: the bottom
      bot's intro half turns up, its canvas words turn to face the top, none runs off the
      screen (`solo-top-<id>.png`).
- [x] 2026-11-07 (F120): With F118 the bot's half read upright, so its words addressed to
      "you" ("You win the round!", "Your kick!", "You go first!", "You tee off first")
      looked like they were for the person. A bot seat facing a person now gets none of
      them (`silentSeat()` in engine/draw.ts): Snake and Chop Chop round banners, Quick Draw
      round result and fake-out note, Minigolf tee-off and leader lines, Penalty kick/save
      pops, Air Hockey's "Your shot!", the countdown's starter line. Both solo playtests fail
      on any you/your word drawn for the bot seat (it found Penalty's "Your kick!").
- [x] 2026-11-07 (F122, PR #173): The solo playtest only watched the first 2.6 s, so round-end
      banners were never read. It now plays each solo game on (0.25 s steps, a frame drawn
      between) to the first point or match end and re-checks the bot's half for you/your
      words (`solo-round-<id>.png`). It found Minigolf's "YOUR SHOT!" banner drawn in the
      bot's half when the bot shoots; that banner now skips a silent bot seat (the person's
      half says "Bot's shot"), and a bot's wind badge says "🌬️ wind" / "Lining up…"
      instead of "on you" / "Pull back, let go". Sea Battle and RPS wait for the person's
      move, so they're only checked up to there (`WAITS_FOR_PERSON`).
- [x] 2026-11-07 (F123, PR #174): Playing the bot, big banners both seats draw ("Bot wins the
      round!", "Steady…", "HOLE IN ONE!") read upright twice, one above the other, since
      F118. text() now skips the bot seat's copy of a banner the person's half drew this
      frame or last (only worded labels at size 22+, so scores, names and small status
      lines still show on both sides). Unit test in tests/reader.test.ts; solo screenshots
      for Sumo and Minigolf show one banner. Small repeated lines (Quick Draw's "Round 1")
      stay.
- [x] 2026-11-07 (F124, PR #175): Chop Chop's small "them: N" pill in the bot's half (the
      person's count, from the bot's side) read upright to the person as the bot's own
      count once F118 turned it. A bot seat facing a person no longer draws it; the
      person's half still shows both counts. The solo playtests now flag "them" as well as
      you/your in the bot's half.
- [x] 2026-11-07 (F127): Backlog sweep: the two open Twin Gates lines from 2026-11-01 were
      already fixed by F29; ticked with today's numbers (easy 5.2 strokes, 8% picked up).

- [x] 2026-11-07 (F126, PR #177): Quick Draw's small "Round N" line above "Steady…" still
      showed twice upright when playing the bot (F123 only folds banners at size 22+). The
      bot seat facing a person no longer draws it; the solo playtest checks. Snake's corner
      "Round N" HUD labels stay on both sides (each sits by its own score).
- [x] 2026-11-07 (F125, PR #178): The solo round-end check (F122) stopped at Sea Battle's and
      RPS's first turn, which waits for the person. The playtest's person (playtest/person.ts)
      now plays 8 s of each in real time with the probe on and must make a move, so their
      shot / throw results and the bot's answers are checked for you/your/them words too.

## Ideas found 2026-11-07 (tank mine run)
- [x] 2026-11-07 (F129): Tank Duel Mine lost to no power between easy bots (46%, n=120): in
      60 easy matches the other tank never once rolled over a mine, because every bot drove
      round every mine it saw, and the owner rolled over its own 3 times. A bot now notices
      the other tank's mine with BOT.spot odds (easy 50%, normal 75%, hard 95%, decided
      once per mine; its own always), like a kid who missed it going down, and drops a
      mine when the other tank is in its wake (within 45° behind, under 220) instead of
      whenever it's close. `sim:powers -- --game tanks --n 120`: easy Mine 46% -> 51% vs
      none (avg 43% -> 47%), normal 44% -> 47% (avg 43% -> 46%). Unit tests in
      tests/tanks-route.test.ts.
- [ ] Tank Duel Mine still rarely hits anyone between bots (tanks fight at range, so few
      drive through a wake); it may play better against people, who chase. If families
      never pick it, a bigger blast or a mine that's dropped in front could be a power call.

## Ideas found 2026-11-07 (chop chop double run)
- [x] 2026-11-07 (F130): Chop Chop's timer drained faster the higher your count, so Double
      Chop's 4 bonus chops sped up your own timer: a hidden cost that hurt most at easy,
      where rounds end on time. It now drains by the chops you've made (trunk position),
      so play without Double is unchanged. `sim:powers -- --game chopchop --n 120`: easy
      Double 40% -> 45% average, 45% -> 52% vs none; normal unchanged. Unit test in
      tests/chopchop.test.ts.
- [ ] Chop Chop at normal: normal bots rarely run out of time, so a round is a race to 50
      and any power beats none ~90% (none 11%), Double 71% and Freeze 67% on average,
      Shield 51% (29-34% against the others). Real matches give both seats a power, so the
      "none" column matters less; Shield is the weak pick at normal but the strongest at
      easy (60%). A power call if families find Shield useless against a fast chopper.
- [x] 2026-11-07 (F128): Play the bot: small per-seat lines the bot's half drew twice now show
      once, in the person's half: Snake's corner "Round N" and score line (its copy read back
      to front, "0 – 1" beside "1 – 0"), Quick Draw's score under the stars, Tank Duel's
      "Round N" / arena pill (size 20, under F123's banner fold). The solo playtest now fails
      any game whose bot half shows a "Round N" or "a – b" line, at the start and round end.
- [x] 2026-11-07 (F131): Chop Chop round end: running out of time always ends the round on the
      same step, so the "Time's up!" pop (rising from the chop count) sat on the "Out of time!"
      banner and the "0 / 50" count at once. The pop is gone (the buzz and banner stay); the
      solo playtest checks no such pop is up when the idle person's time runs out.
- [x] 2026-11-08 (F139): Play the bot: Minigolf's hole card (and the scorecard between holes)
      show only in the person's half. The bot's copy, with the hole name folded by F123, was a
      big dark card saying just "HOLE 1 OF 3 / Par 2" over the far third of the course, and its
      scorecard's "You" column was the bot's. The solo playtest fails any hole card or
      scorecard words in the bot's half, at the start and at the hole end.
- [x] 2026-11-08 (F140): Sumo's round banner ("Round 2", "GO!", "Final round!") sat 56 from the
      ring's centre, right on each wrestler's start spot, the moment a kid looks for theirs.
      It now sits 26 from the centre, between the wrestlers (size capped at 30 so the two
      mirrored copies stay apart); tests/sumo.test.ts checks the geometry.
- [x] 2026-11-08 (F141): Snake: a crash at the far wall popped "CRASH!" on the wall, and it rose
      out of the arena over the other seat's turn buttons and power. Crash pops now start
      where their whole rise stays inside the arena (`crashPopY()`); tests/snake.test.ts.
- [x] 2026-11-08 (F142, PR #191): Play the bot: Quick Draw's signal (Steady…, Wait for it…, a
      fake-out card, DRAW!) shows only in the person's half. F123 folded the bot copy's big
      words but left its card upright: a fake-out read "bridge! 🌉" alone and DRAW! was an
      empty red card. The solo playtest plays on to a worded fake-out and a DRAW! and fails
      any signal words in the bot's half (failed on main with "Wait for it…", "DRAW-er!").
- [x] 2026-11-08 (F143, PR #192): Snack Snatch's miss pop was "miss" at 15 units in 75% white
      (about 13 px on a 320 px phone, over the tablecloth's edge), so a kid hardly saw why
      their frog went dizzy. It is now "Miss!" at 19 in solid white with the pop outline;
      tests/snacksnatch.test.ts holds the size and colour, the contrast test still passes.
- [x] 2026-11-08 (F144, PR #192): no other card left behind a folded banner in the bot's half: every
      backplate under a size-22+ banner (Snake and Chop Chop round cards, Tank Duel's pill,
      Minigolf's shot banner and hole card) already skips a silent seat; Sumo, Penalty and
      Air Hockey banners have no backplate. Quick Draw's was the last one (F142).
- [x] 2026-11-08 (F145, PR #193): the intro's "← Back" wrapped into an arrow over the word
      beside a two-line blurb (Chop Chop, Minigolf, Penalty, Snack Snatch, Sumo at 320-360 px).
      It now stays on one line (`white-space: nowrap`); the layout playtest fails any intro
      whose Back link wraps, at three phone sizes, with and without Bigger text.
- [x] 2026-11-08 (F146, PR #194): Play the bot on today's minigolf course: the result's bot half
      repeated the day's best ("📅 Today's best: 9 by Player 1") right above the person's own
      "New best today: 9!". It now shows once, in the person's half; two people keep a line
      each. The daily playtest checks one line in a solo result.
- [x] 2026-11-07 (F133): Backlog sweep: RPS person line (done by F125) and the air hockey
      "walks away" flake watch (no repeat) ticked with why.

## Ideas found 2026-11-08 (masher run)
- [x] 2026-11-08 (F135): a rival app's reviews say its hard Sumo "needs near-perfect timing".
      Ours, `npm run sim -- --game sumo --n 80`: hard v normal 78%, hard v easy 98%, normal v
      easy 93%, masher with ★★★ v easy 35%. Hard is clearly stronger but normal still wins
      about one match in five, so no change; recheck if families call hard Sumo unbeatable.

## Ideas found 2026-11-08 (pre-reader run)
- [x] 2026-11-08 (F147): Quick Draw's "Steady…" and "Wait for it…" were words only, so a child
      who can't read yet had nothing telling them to hold off. A raised hand ✋ now sits on both
      sides of those lines (each seat's half) until the red DRAW! card; a worded fake-out card
      gets none, since fooling the reader is its trick. Source test in tests/quickdraw.test.ts.
- [x] 2026-11-08 (F148): Air Hockey: a power used right after a goal printed its name
      ("🧊 Freeze!") inside the GOAL! banner (born 30 apart, both rising). Pops now start a line
      apart: GOAL! 80, "Your shot!" 130, power 180 from the middle; tests/airhockey.test.ts.
- [x] 2026-11-08 (F149): Ping Pong printed the rally count ("Rally x5!", "Rally x10! 🔥") right
      over SMASH!/Curve! (same hit, same spot: ~30 times in 9 bot matches) and "What a rally!"
      over "Match point!". Words born together now take lanes from the net: POINT! 90, shot
      words 130, rally count and Match point! 170 (a second Match point! 210). A pop probe in
      fx.ts (`__pops`) lists pops born together on top of each other; an e2e test plays Ping
      Pong and Air Hockey at every level and expects none.
- [x] 2026-11-08 (F150): The pop probe also found smaller same-step overlaps elsewhere (9 bot
      matches a game): Quick Draw and Penalty when both seats fire a power on the same step,
      Snack Snatch "+1"/"+3 ×2!" when two snacks land together (~10), Tanks "BONK!"/"Oops! Own
      shot", Minigolf "Splash! +1 stroke"/"Picked up". fx.pop() now stacks pops born together
      for one seat like lines of text (the newer a line further down in that seat's view, or
      above at the screen's edge), and pops stay on screen. tests/pops.test.ts; the e2e pop
      check covers every action game.
- [x] 2026-11-08 (F151): Play the bot: the "3 2 1" countdown drew in both halves, and since the
      bot half turned to face the person (F118) that read as two upright digits in every game.
      It now shows once, in the person's half (`countdownSeats()` in src/app/starter.ts, unit
      test; the solo playtests check it from the bottom and the top seat). Two people or two
      bots keep both copies.

## Ideas found 2026-11-08 (finger card run)
- [x] 2026-11-08 (F152): First match: the in-play finger card sat at each person's countdown
      digit (0.72 down = MID + 120) in every game but Ping Pong, so "3 2 1" showed through its
      dark tile. A card at the digit's height now sits to the person's right of it, a little
      smaller (`besideCountdown()` in src/app/demo.ts); a playtest checks every shown game at
      320x568, both seats.
- [x] 2026-11-08 (F153): Chop Chop and Snake opened round 1 with their own "Round 1" card for
      1.3 s after the match's "3 2 1 GO", so GO was followed by a wait in which Chop Chop's
      chops did nothing. Round 1 now starts at GO (its card still shows during the countdown);
      later rounds keep their card. Unit tests in tests/chopchop.test.ts and tests/snake.test.ts.

## Ideas found 2026-11-08 (countdown run)
- [x] 2026-11-08 (F155): Chop Chop's "Round 1" card (left from F153 to show during the
      countdown) sat right under each person's "3 2 1" digit (both at MID ± 120), so it read
      "Rou 1". Round 1 has no card now; later rounds keep theirs (`roundCard()`, unit test).
- [x] 2026-11-08 (F156): Penalty's first "Your kick!" / "Save it!" pops were born with the
      view, during the countdown, so they rose and faded (0.9 s) under the dim and the
      "3 2 1" digit and nobody read them. They now pop on the first step after GO, and the
      keeper's "Kick in 3" line (under their digit too) also starts at GO.
- [x] 2026-11-08 (F157): Quick Draw drew its "Round 1" and "Steady…" lines during the
      countdown, where the top seat's sat beneath its "3 2 1" digit. The signal now starts at
      GO (the round's own wait starts there anyway), so the digit reads alone.
- [x] 2026-11-08 (F158): A playtest boxes every label drawn during the countdown (draw.ts
      `boxProbe`, `__boxes`) and fails on any that meets a person's "3 2 1" digit, in every
      shown game at 320x568, both seats people. It found two more: Ping Pong's "Flick up hard:
      SMASH" hint (now waits for GO) and Snake's "Tap ◀ ▶ to turn" (moved below the digit,
      MID ± 205).
- [x] 2026-11-08 (F159, PR #206): Sea Battle and RPS with two people opened on the
      pass-the-phone cover while the "3 2 1" counted down over "Player 2, look away!". A game
      that opens on a cover now says so (`opensOnCover()`) and the runner skips the countdown:
      the cover's own "Tap when only … is looking" is the ready step, and a turn game needs no
      GO. With a bot (no cover) the countdown stays. The F158 playtest checks both games open
      on the cover with no digit (countdown-cover-seabattle.png), and the first match's
      in-play ghost finger no longer taps over "look away!" there (the cover says what to tap).
- [x] 2026-11-08 (F160, PR #207): Play the bot showed Snack Snatch's seconds left twice beside
      the pot: the bot seat's copy turned to face the person and read as a second clock (two
      pink "0"s at the end in solo-round-snacksnatch.png). A bot seat facing a person draws no
      clock now (silentSeat); tests/snacksnatch-clock.test.ts counts the copies.
- [x] 2026-11-08 (F161, PR #208): Play the bot: Chop Chop's bot count read "/ 50  1". Its
      words turn to face the person, but each turns about its own spot, so the "/ 50" label
      kept the mirrored place left of the count (solo-play-chopchop.png). A bot's half facing
      the one person puts it on the other side; tests/chopchop-solo.test.ts reads both seats'
      "N / 50" left to right, with people and with a bot on either seat.
- [x] 2026-11-08 (F162, PR #209): Play the bot: the bot's big buttons still said HOLD / LET GO
      (Sumo) and TAP (Snack Snatch hippos), turned upright for the person: how-to words nobody
      at the table reads (F119; Quick Draw's bot button was already blank). A bot's button
      facing the one person carries no word now (Sumo's charge ring still shows it winding up);
      the solo playtest's how-to list fails on HOLD, LET GO and TAP in the bot's half.
- [x] 2026-11-08 (F163, PR #210): Play the bot: Ping Pong's bot score card turned upright with
      its "vs N" (the person's points) above the number, a back-to-front card next to the
      person's "N / vs N" (solo-play-pingpong.png). A bot's card facing the one person shows
      just its points; tests/pingpong-solo.test.ts counts the "vs" lines. The fake canvas that
      follows transforms now lives in tests/canvasRecorder.ts.
- [x] 2026-11-08 (F164, PR #211): Play the bot: Minigolf's bot strip read "Total | Hole" next to
      the person's "Hole | Total" (each turned word keeps its mirrored spot), and Tank Duel's
      bot hearts and shell dots (and Sumo's round pips) filled from the other end than the person's. A bot's half
      facing the one person swaps the Minigolf columns and fills its Tanks rows from the
      person's end (Sumo's pips too); tests/minigolf-solo.test.ts and tests/tanks-solo.test.ts (the fake canvas
      records colours now). Swept the rest: Snack Snatch 👅×N, Chop Chop, Ping Pong and
      Snake have no other side-by-side pairs left in a bot's half.
- [x] 2026-11-08 (F165, PR #212): Play the bot: the person's own half called the bot "them":
      Quick Draw's result card read "You — / Them 500 ms" ("They got fooled!") and Chop
      Chop's rival pill "them: 9" (solo-round-quickdraw/chopchop.png). Against a bot they
      say "Bot 500 ms", "Bot got fooled!", "bot: 9"; two people keep "them".
      tests/bot-name.test.ts reads both.
- [x] 2026-11-08 (F166, no change): a rival app's review says its hard snake "copies" the
      player so rounds can't be won or lost. Ours can't stall: seeded start lanes, a speed ramp
      and the 9-round cap (100 matches per row, scratch sim): easy v easy rounds avg 12 s, 23%
      draws; normal v normal 23 s, 5%; hard v hard 11 s, 50% draws (36% head-on) and 43/100
      matches reach round 9; a seat copying the bot's turns draws 21% (hard) / 61% (easy),
      longest round 46 s anywhere. Head-on draws are the bots' (both race the same cells);
      a much stronger head-on penalty in SnakeBot only cut hard v hard to 30% draws (17%
      head-on), so it was left alone. Revisit if families report many draws against the bot.
- [x] 2026-11-08 (F167, PR #213): Play the bot: Penalty's kick tracker showed twice, the bot's
      copy turned to face the person and mirrored (its score on the left, kicks running right
      to left, the bot's row first; solo-play-penalty.png). It shows once now, in the person's
      half; tests/penalty-solo.test.ts counts the trackers' score digits.
- [x] 2026-11-08 (F168, no change): tablets (a rival app's reviews say families pick a tablet
      for room). At iPad portrait 768x1024 home, intros and Air Hockey / Sumo / Minigolf fill
      the height with 96 px side bars, buttons and text as on a phone: fine. In landscape
      (1024x768) the portrait board is a narrow column at about 1.2x with wide bars.
- [ ] Store wrapper: lock portrait, also on iPad (UIRequiresFullScreen / Capacitor
      orientation), so a landscape tablet never shows the narrow board (F168). A turned
      landscape layout would need the world rotated and input remapped: only if families ask.

## Ideas found 2026-11-08 (bigger-text solo run)
- [x] 2026-11-08 (F169, PR #214): Play the bot: Tank Duel's bot half drew an upright FIRE on its
      button and a second "0 bonks" line (and a second clock near time-up), so the one person
      saw two scores. Its button is wordless now (like Sumo's HOLD, F162), its line reads
      "bot: N bonks", and the clock / sudden-bonk lines show once, in the person's half.
      tests/bot-name.test.ts; the solo playtest fails on FIRE or a bare bonk count there.
- [x] 2026-11-08 (F170, PR #215): Play the bot: the bot's own touch buttons were drawn as
      bright as the person's, inviting a kid to tap a half that does nothing. Snake's turns,
      Penalty's dives, Tank Duel's stick and FIRE and Sumo's push button now draw at 40%
      (draw.ts controlsAlpha); the bot's charge / reload rings, shells and hearts stay bright.
      Snack Snatch's frogs stay as they are: they are the bot's characters, not just buttons.
      Two people or two bots: unchanged. tests/controls-dim.test.ts.
- [x] 2026-11-08 (F171, PR #216): Play the bot: the bot's power button (every action game)
      still read as one more button to press. Its band and face draw at 40% like F170; the
      energy ring and the power's icon stay clear (they tell the person what the bot holds
      and when it can fire). tests/controls-dim.test.ts.
- [x] 2026-11-08 (F172, PR #217): Play the bot: proof the faint bot buttons are dead. A kid
      who taps the bot's turn, dive, push, stick / FIRE, frog or power buttons for 30 s of a
      seeded match changes nothing for either seat (Snake, Penalty, Sumo, Tank Duel, Snack
      Snatch; bot in either seat); the same taps on the person's own buttons do change the
      match, so they really land. tests/bot-buttons-dead.test.ts (no code change needed).

## Ideas found 2026-11-08 (bot buttons run)
- [x] 2026-11-08 (F173, PR #218): Minigolf: the turn passed 0.7 s after a sink, so the next
      shooter's "YOUR SHOT!" printed over the still-rising "HOLE IN ONE!" / "Par! Nice." pop in
      the middle of the course (seen in the solo playtest, two people too). The banner now
      waits for the centre pop to clear (about 0.2 s). tests/minigolf-banner.test.ts.
- [x] 2026-11-08 (F174, PR #219): Play the bot: Minigolf's bot half showed "<person>'s shot"
      turned upright at the top of the course while the person's own strip said "Your shot!";
      the bot's half has no waiting pill now. tests/minigolf-solo.test.ts; the solo playtest
      fails on a "'s shot" line in the bot's half.
- [x] 2026-11-08 (F175, PR #220): Play the bot: Sea Battle's "Ships sunk" columns read
      "you / them"; against a bot the second one says "bot" (as F165 did for Quick Draw and
      Chop Chop). tests/bot-name.test.ts.
- [ ] Research (Xbox Accessibility Guideline 107, input): avoid repeated quick presses and
      long holds, or offer a lighter option ("auto fire", "press instead of hold"). Ours: Tank
      Duel's FIRE needs a fresh tap per shell (a held FIRE could fire as each reload ends),
      Chop Chop is fast tapping by design, Sumo is hold-to-charge. A "Little hands" auto-fire
      for Tank Duel would change balance vs the bot (it waits a human reaction after reload),
      so it's a call for Chris if families say small kids tire of tapping FIRE.
- [x] 2026-11-08 (F176, PR #221): Snack Snatch: the "Miss!" pop started just in front of the
      frog's resting head, so the head pulling back from the missed snap slid over it and the
      word sat on the frog's eyes (seen top seat, snacksnatch-vs-bot-later.png). It starts on
      the blanket past the open jaws now and floats on into the field. tests/snacksnatch-miss.test.ts.
- [x] 2026-11-08 (F183, PR #TBD): Penalty: the shooter's "Curve Shot ready" (any power's ready
      line) sat behind them, across their own goal's net (top seat, 320x568 bot match). It
      reads just past the ball toward the goal now, clear of the kick ring and the run-up's
      closing ring, both seats. tests/penalty-ready.test.ts.
