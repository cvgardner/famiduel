import energyRules from '../../content/powers.json';

// The super power meter. It fills from play; the player who is behind, or who
// has handicap help, fills it faster. Kept gentle on purpose (see docs/design.md).
export const ENERGY = energyRules.energy;

export class Energy {
  value = 0;
  /** Seconds the power stays active after being spent (games read this). */
  active = 0;

  constructor(private readonly assist: number) {}

  /** amount is a fraction of a full bar. trailing = this player is behind in the current game. */
  charge(amount: number, trailing = false): void {
    const mult = 1 + ENERGY.assistBonus * this.assist + (trailing ? ENERGY.trailingBonus : 0);
    this.value = Math.min(1, this.value + amount * mult);
  }

  get ready(): boolean {
    return this.value >= 1;
  }

  /** Spend a full bar. Returns false when the bar is not full. */
  spend(duration = 0): boolean {
    if (!this.ready) return false;
    this.value = 0;
    this.active = duration;
    return true;
  }

  tick(dt: number): void {
    if (this.active > 0) this.active = Math.max(0, this.active - dt);
  }
}
