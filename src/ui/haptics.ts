const PATTERNS = { reject: 12, win: [20, 40, 20] } as const;

/** A tap of feedback where the platform supports it (Android; iOS Safari has no vibrate). Follows the sound setting. */
export function buzz(
  kind: keyof typeof PATTERNS,
  enabled: boolean,
  nav: { vibrate?: Navigator['vibrate'] } | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): void {
  if (!enabled || typeof nav?.vibrate !== 'function') return;
  try {
    const p = PATTERNS[kind];
    nav.vibrate(typeof p === 'number' ? p : [...p]);
  } catch {
    // Some browsers throw when vibration is blocked by policy; feedback is optional.
  }
}
