import type { BotLevel, PlayerInfo, PowerDef } from '../src/core/types';
import powers from '../content/powers.json';

export function player(opts: Partial<PlayerInfo> = {}): PlayerInfo {
  return { name: 'P', color: '#3fa9ff', assist: 0, power: null, bot: 'normal' as BotLevel, ...opts };
}

export function power(game: string, id: string): PowerDef {
  const list = (powers.games as Record<string, PowerDef[]>)[game];
  const p = list?.find((x) => x.id === id);
  if (!p) throw new Error(`no power ${game}/${id}`);
  return p;
}

export const DT = 1 / 60;
