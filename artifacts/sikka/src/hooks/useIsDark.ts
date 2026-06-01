import { useEffect, useState } from 'react';

/**
 * Tracks whether the app is currently in dark mode by observing the
 * `dark` class on <html>. Stays in sync with ThemeToggle.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const el = document.documentElement;
    const update = () => setIsDark(el.classList.contains('dark'));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

export const MAP_STYLE_LIGHT = 'mapbox://styles/mapbox/streets-v12';
export const MAP_STYLE_DARK = 'mapbox://styles/mapbox/dark-v11';
