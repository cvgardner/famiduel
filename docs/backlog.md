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
- [ ] Settings: bot difficulty per game remembered; left-handed button mirroring.
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
- [ ] Accessibility: larger text option.

## Content
- [ ] Mini pool (first update).
- [ ] More minigolf holes (target 18).
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
- [ ] Sea Battle vs a bot: the bot's shot and the hand-back are quick (0.45 s + 0.7 s); a
      kid may not see where it hit. Consider a short ring on the cell hit and a longer beat
      on hits.

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
