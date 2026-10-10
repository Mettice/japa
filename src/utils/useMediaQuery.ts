import { useEffect, useState } from 'react';

// Live CSS media query match, e.g. useMediaQuery('(pointer: fine)') for mouse/trackpad users
export const useMediaQuery = (query: string): boolean => {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};
