import { useEffect, useState } from 'react';

/** The one definition of "phone". CSS uses the same condition: @media (max-width: 640px) and (orientation: portrait). */
export const PHONE_QUERY = '(max-width: 640px) and (orientation: portrait)';

const matches = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;

/** Only feeds table geometry; chrome is switched by CSS so first paint never waits on JS. */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(() => matches(PHONE_QUERY));
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY);
    if (!mq) return;
    const update = () => setPhone(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return phone;
}
