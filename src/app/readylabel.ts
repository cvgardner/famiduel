/**
 * F256: the intro's Ready button leads with an icon, so a pre-reader (and the top player,
 * who reads it upside down) can tell its states apart without the words. Google's design
 * guidance for kids' apps: avoid text-only buttons. The words stay as the accessible name.
 */
export type ReadyState = 'pick' | 'peek' | 'ready' | 'done';

/** [icon, words] per state. */
export const READY_WORDS: Record<ReadyState, [string, string]> = {
  pick: ['👆', 'Pick a power'],
  peek: ['👆', 'Tap a power to see it'],
  ready: ['👍', 'Ready!'],
  done: ['✅', 'Ready'],
};

export function readyLabel(state: ReadyState): string {
  const [icon, words] = READY_WORDS[state];
  return `<span class="btn-ico" aria-hidden="true">${icon}</span>${words}`;
}
