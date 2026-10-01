export interface HintEnv {
  phone: boolean;
  standalone: boolean;
  dismissed: boolean;
  gamesPlayed: number;
  ios: boolean;
  canPrompt: boolean;
}

/** Which install hint to show, if any. Never before a first finished game, so it can't interrupt one. */
export function installHintMode(env: HintEnv): 'ios' | 'android' | null {
  if (!env.phone || env.standalone || env.dismissed || env.gamesPlayed < 1) return null;
  if (env.ios) return 'ios';
  return env.canPrompt ? 'android' : null;
}

/** iPadOS reports a Mac user agent; touch points give it away. */
export const isIOS = (ua: string, maxTouchPoints: number): boolean =>
  /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
