# Rules check: do our classics play by the rules families know?

Chris (1 Nov 2026): a game's rules must match the familiar ones (Sea Battle's extra shot on a
hit is the example). This page lists, per game, the rule a family would expect and what
FamiDuel does, so a parent can check "is this the real rule?". Numbers come from each game's
`RULES` in `src/games/<id>/logic.ts`; update this page when you change one.
Checked 2026-11-07 (weekend loop F33). Hidden board games (Checkers, Four in a Row,
Tic-Tac-Toe) are left out: they get no work.

| Game | The rule families know | FamiDuel | Match? |
|---|---|---|---|
| Ping Pong | Games to 11, win by 2; serve changes every 2 points, every point at deuce (10-10). | To 7, win by 2, and 10 wins outright so deuce can't drag on. Serve changes every 2 points and every point once both reach 6 (the same rule, scaled to 7). | Yes, shortened |
| Air Hockey | First to 7 goals; the player scored on gets the puck; 7 s to shoot from your own half. | First to 5. The player scored on gets the puck. After 4 s in one half a "Your shot!" nudge, after 7 s the table's air blows the puck over the centre line. | Yes, shortened |
| Penalty Shootout | 5 kicks each, taking turns; it ends as soon as one side can't catch up; then sudden death in pairs. | Exactly that. After 20 kicks each with no winner it's a draw (safety cap; never reached in play). | Yes |
| Minigolf | Lowest total strokes wins; many courses pick a ball up at 6 strokes. | 3 holes a match, lowest total wins, a tie is a draw. A ball is picked up at 6 strokes, or par + 3 on par-4 and par-5 holes. The better score on a hole tees off first on the next (honour). | Yes |
| Sea Battle | 10×10 grid; ships of 5, 4, 3, 3, 2; call shots in turn; sink every ship to win. Many families play "a hit shoots again". | 10×10, ships 5-4-3-3-2, and a hit fires again (house rule, Chris's call). | Yes |
| Sumo | Push the other wrestler out of the ring. One bout. | Push them out of the ring; best of 3 rounds (first to 2). The ring shrinks after 18 s so a round always ends. | Yes, best of 3 |
| Tank Duel | No one standard; arcade tank duels are "last tank standing". | 5 armor each (a head start gives up to 8); shells bounce. At 2:30 the one with more armor left wins, then sudden death, then a draw. | Original |
| Snake Duel | Two-snake duel (light-cycle style): run into a wall or any trail, yours or theirs, and you lose; head-on, both crash. | Exactly that, round by round; first to 3 rounds; a round where both crash doesn't count. | Yes |
| Quick Draw | Fire after "DRAW!"; fire early and you lose the round. | Exactly that; first to 3 rounds. A round where both jump early, nobody taps or it's an exact tie doesn't count. Some powers forgive one early tap. | Yes |
| Chop Chop | Original (timing game). | First to 3 rounds. | Original |
| Snack Snatch | Original (grab the snacks). | 30 s match, most snacks wins; a tie goes to a golden "sudden snack". | Original |
| Rock Paper Scissors | Rock beats scissors, scissors beat paper, paper beats rock. | Exactly that. | Yes |

No mismatches found: where FamiDuel differs, it shortens a match (Ping Pong to 7, Air Hockey
to 5, Sumo best of 3) so a family match fits a few minutes, and keeps the rule's shape.
If a family asks for the full length, a "long match" setting (Ping Pong to 11, Air Hockey to
7) would be the change, not new rules.
