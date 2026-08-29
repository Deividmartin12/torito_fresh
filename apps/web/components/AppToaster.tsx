'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

export function AppToaster() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const readTheme = () =>
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    readTheme();
    const observer = new MutationObserver(readTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return <Toaster theme={theme} position="top-right" richColors closeButton duration={4500} />;
}
