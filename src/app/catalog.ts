// Which games get a card on the home screen. No DOM, so tests can read it.
import gamesJson from '../../content/games.json';

export type GameMeta = (typeof gamesJson.games)[number];

/**
 * A game with `"hidden": true` in content/games.json keeps its code, tests and saves but has
 * no home card (Chris, 1 Nov 2026: board games families already own, or play in other apps,
 * add little). Delete the flag to bring one back; `?all` in the URL shows every game.
 */
export const shownGames = (all = false): GameMeta[] => gamesJson.games.filter((m) => all || !m.hidden);
