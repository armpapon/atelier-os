import { useEffect, useState } from 'react';

/**
 * MOBILE_QUERY — จุดตัด "จอแคบ" ของทั้งแอป
 * ต้องตรงกับ media query ใน styles.css (App shell section) เสมอ
 * <1024px = มือถือ/แท็บเล็ตแนวตั้ง → bottom nav แทน sidebar
 */
export const MOBILE_QUERY = '(max-width: 1023px)';

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
