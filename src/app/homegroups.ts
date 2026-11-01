/**
 * The home grid in labelled groups, so a parent scrolling a small phone can tell where the
 * lively games end and the calm, take-turns board games begin. The order inside each group
 * (and of the groups) is the order of content/games.json: action games first.
 */
export type HomeGroupId = 'action' | 'board' | 'extra';

export interface HomeGroup<T> {
  id: HomeGroupId;
  title: string;
  games: T[];
}

export const GROUP_TITLES: Record<HomeGroupId, string> = {
  action: '⚡ Action games',
  board: '🧩 Board games · take turns',
  extra: '🎁 Free extras',
};

/** Which group a game's `kind` puts it in. */
export function groupOf(kind: string): HomeGroupId {
  if (kind === 'Extra') return 'extra';
  if (kind.startsWith('Strategy')) return 'board';
  return 'action';
}

/** Split the games into their groups, keeping the list order; empty groups are left out. */
export function homeGroups<T extends { kind: string }>(games: T[]): HomeGroup<T>[] {
  const out: HomeGroup<T>[] = [];
  for (const g of games) {
    const id = groupOf(g.kind);
    let group = out[out.length - 1];
    if (!group || group.id !== id) {
      group = { id, title: GROUP_TITLES[id], games: [] };
      out.push(group);
    }
    group.games.push(g);
  }
  return out;
}
