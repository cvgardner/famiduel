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
- [ ] Rivalry card after a match night (shareable image, behind a parental gate).
- [ ] Family Wrapped prototype from the on-device match history.
- [ ] Daily minigolf course (seed from the date) with a "beat my score" link.
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
- [ ] Accessibility: larger text option (a setting that scales canvas text and menus ~1.25×;
      needs the intros to fit at that size).

## Content
- [ ] Mini pool (first update).
- [ ] More minigolf holes (target 18). 10 so far.
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
- [ ] More tank arenas, more Snack Snatch snack types.

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
- [ ] In-game canvas buttons: Checkers squares (45 units) and Sea Battle grid cells are the
      smallest canvas targets; check their size on a 320 px phone and whether a mis-tap is
      easy to undo.
- [ ] Ages 4-6 guidance asks for 56-64 px primary buttons; consider a "little hands" setting
      that enlarges Ready / power cards (needs a taller intro layout).
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
- [ ] Minigolf's top and bottom HUD strips are near-black, so its bars still read as black
      bands; a lighter HUD edge (or grass running under it) would make it fill the phone too.

## Ideas found 2026-11-01 (minigolf holes run)
- [x] 2026-11-01: `text()` set `globalAlpha` to its own `alpha`, so a caller's fade never
      reached the words: a disabled button's label stayed bright on its 35% circle, and
      `PowerButton.render` reset the alpha for its own parts, so Penalty's unusable power
      (dimmed to 45% by the game) drew at full strength. `text()` now multiplies the canvas's
      alpha by its own and buttons draw relative to the caller's alpha; Minigolf's hole card
      and shot banner no longer pass their fade twice. The contrast probe now judges a label
      at the opacity it is really drawn at. Unit tests with a recording canvas
      (`tests/alpha.test.ts`); verify warnings unchanged from main.
- [ ] Minigolf: Bumper Bowl gives the hard bot 40 aces in 40 and normal 17; Lily Pond and Hill
      Climb give normal ~14 aces in 40. Fine for kids, but a hole order by measured difficulty
      (normal-bot strokes over par) would put them before Dog Leg.

## Ideas found 2026-10-31 (haptics run)
- [ ] Store wrapper: plug a native haptics call (Capacitor Haptics, iOS Taptic) into
      `new Haptics(vibrate)` so iPhones get the same feel.
- [ ] Haptics per seat isn't possible on one phone (both players feel every buzz); keep
      patterns for shared moments only. If kids find it distracting, default it off for
      the turn-based games.

## Ideas found 2026-10-31 (pause run)
- [ ] Same hold-to-confirm for the result screen's "Games" button if kids skip the result
      before the other player has seen it (check in the playtest how fast the monkey hits it).
- [ ] VoiceOver/TalkBack: the pause button says "press and hold"; a screen reader double
      tap is a click with detail 0, which pauses at once. Check that on a real phone.
- [ ] Guided Access / screen pinning tip on the home screen for parents of toddlers (the
      OS-level way to stop a kid leaving the app), behind the parental gate.

## Ideas found 2026-10-31 (text size run)
- [ ] Reviews of the leading app: a game where the first shooter wins if they score every
      shot (basketball). Check every turn-based game for a first-mover edge in sims (Penalty
      already alternates with sudden death; Minigolf's lead-off alternates).
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
- [ ] Ghost finger in play: show the same gesture once over each player's own half at the
      first serve / first turn of a first match (needs a view hook per game for where).
- [ ] A "?" on the intro to bring the ghost finger back after the first 3 matches.
- [ ] Penalty's demo shows only the shooter's swipe; the keeper's tap is in text only.
      Games with two roles could alternate both gestures.

## Ideas found 2026-10-31 (Sumo head start run)
- [ ] Sumo with no head start: a masher still loses every match (self-outs). Auto handicap
      only adds help after a lost match in the night; for a first match against a bot, a
      head start suggestion on the intro ("Little one? Give a head start") could help.
- [ ] The playtest monkey and the unit-test "masher" are two models of a mashing kid;
      share one masher model (tests/helpers) and reuse it for other one-button games
      (Chop Chop, Quick Draw) to measure whether a masher can ever win there.
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
- [ ] Checkers vs the normal bot: the person (random legal moves) is down a few pieces within
      25 s; check the easy bot gives a kid who plays randomly a real chance (bot pace table).
- [ ] Tic-Tac-Toe never buzzes on a mark (marks play 'tap' / 'pop'); decide whether turn
      games should tick on each move like Four in a Row now does, or stay quiet.
- [ ] Rock Paper Scissors could get a person too, so the report counts throws per seat.

## Ideas found 2026-10-31 (colour-blind run)
- [ ] COLORS.good (#4ade80) and COLORS.bad (#ff5c7a) are a red/green pair (0.09 for deutan);
      anywhere they carry meaning alone (hit/miss, right/wrong) add a shape or word too.
- [ ] Game cards' own colours (`content/games.json` `color`) aren't checked; fine since the
      name and icon carry them, but a game that colours pieces by card colour would need it.
- [ ] A shape per seat (e.g. a small ring vs dot on paddles, snakes, pieces) would make
      seats readable even in greyscale or bright sunlight, not just for colour blindness.

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
- [ ] The easier offer could also suggest the head start when the bot is already Easy
      (Sumo, Minigolf), pointing at the player sheet behind a tap.

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
- [ ] The home player chip shows the sheet's bot level only; a game card could show a small
      🤖 badge when that game has its own level.
- [ ] The layout fit test only ran intros with two people; it now runs with a bot too, but
      not on a tall phone (390×844) where the desktop-size how-to text shows for bots.

## Ideas found 2026-10-31 (air hockey stall run)
- [ ] Other real-time games may stall with an idle player too (Ping Pong serve, Penalty
      shooter, Tanks): a playtest that idles one seat against a bot in every game and
      checks a result arrives within ~3 minutes would find them all.
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
- [ ] Air Hockey easy bot vs a real kid: with fewer bot own goals, a kid's free goals are
      gone. Check the playtest monkey's score vs easy and, if kids stop winning, slow the
      easy bot's paddle reaction rather than bringing the own goals back.
- [ ] The air hockey bot still concedes some goals off fast rebounds (it reacts to where
      the puck was 0.1-0.45 s ago). Fine and human-like; recheck if hard looks clumsy.
- [ ] An idle-seat sim for every real-time game (this run's scratch script) could become a
      `npm run sim` table with the bot pace table idea above.

## Ideas found 2026-10-31 (contrast run)
- [ ] Chop Chop's "◀ chop / chop ▶" hints drop to 45% opacity once play starts (about
      1.6:1 on the grass). The probe judges a label at its best, so it passes on the intro;
      decide whether faint in-play hints are fine or give them a dark pill.
- [ ] Menus (DOM) aren't contrast-checked yet; the same check over the intro and result
      screens' text (computed colour vs the element's background) would cover them.
- [ ] The playtest only plays Blue vs Pink; run the contrast pass once with Mint vs Orange
      (the lightest pair) so labels drawn in a player's colour are checked at their worst.

## Ideas found 2026-11-01 (pop outline run)
- [ ] Extend the source check of `fx.pop` colours to every game against its own play
      surfaces (Quick Draw sand, Minigolf grass, Ping Pong table), so rare pops elsewhere
      are covered too; needs each view to export its surface colours.
- [ ] Purple on the dark floor (#14112b) is about 4.2:1, so a small (15-16 px) pop in a
      Purple player's colour ("they used …" in Snake/Tanks) is below 4.5:1; the playtest
      only plays Blue vs Pink. Run one pass with Purple and Mint and give player-colour
      pops a lighter tint or a larger size.

## Ideas found 2026-11-01 (left-handed run)
- [ ] Left-handed power buttons: most games put the power button in the player's left
      corner (free hand for a right-hander). Mirroring it for a lefty needs each game's
      opposite corner cleared first (Minigolf's Hole/Total, Air Hockey's score).
- [ ] Tank Duel: both FIRE buttons are the same red for both players; a player-coloured
      rim would make "whose button" clearer when kids sit close.

## Ideas found 2026-11-01 (Sea Battle beat run)
- [ ] Sea Battle between two people: the 'after' beat (1.3 s) is also counted from the
      shot, not the landing, so the shooter sees their own result for about 0.9 s before
      "Now pass the phone"; check whether it needs the same landing-based timer.
- [x] 2026-11-01: Four in a Row rings the newest disc. Checkers already tints the last
      move's squares and Tic-Tac-Toe's 9 cells draw each mark in, but in Four in a Row a
      bot's disc landed in 0.6 s among up to 41 others with nothing to say which was new.
      Now the newest disc (a drop, a bomb's disc where it ends up, or the disc a flip
      turned) wears a pulsing white ring once it lands, until the next move; a block
      places no disc and leaves it. `FourInARow.last` is unit tested; the playtest plays a
      normal bot, checks its disc is ringed for 3 s while the person thinks and that the
      ring moves to the person's disc when they drop (`fourinarow-last-disc.png`).

## Ideas found 2026-11-01 (newest disc run)
- [ ] Tic-Tac-Toe and Checkers lose their "what changed" cue when a person looks away for
      the bot's move in a later, fuller board; a faint ring on the newest TTT mark would
      match Four in a Row.
- [ ] Four in a Row's top player reads "Player 1's turn" in small grey text: the waiting
      side could say "Waiting…" like Tic-Tac-Toe, which reads quicker.

## Ideas found 2026-11-01 (Sea Battle hit-again run)
- [ ] Sea Battle: with hit-again, a bot can chain 4-5 hits on your fleet in one turn; the
      bot-result beat shows the whole turn's total, but a kid may want each hit called out
      ("hit 3 times!" is there; maybe a small count badge on each new hit).
- [ ] Rules audit of the other classic games against the rules families know (Checkers
      forced jumps and kings, Four in a Row, Ping Pong serve every 2 points, Penalty 5 each
      then sudden death), listed in docs so a parent can check "is this the real rule?".

## Ideas found 2026-11-01 (text alpha run)
- [ ] Other helpers that set `globalAlpha` to an absolute value (fx particles and flash,
      several games' `= 1` resets) would also cancel an outer fade; if a whole screen ever
      fades (e.g. a result transition), make them relative like the buttons.
