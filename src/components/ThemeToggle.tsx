'use client';

import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    const choice = next ? 'dark' : 'light';
    try {
      localStorage.setItem('theme', choice);
    } catch {
      /* private mode / blocked storage — the cookie below still carries the choice */
    }
    // Immediate cookie so the very next page load already sees it; the request below
    // replaces it with a server-set one that Safari does not purge after 7 days.
    try {
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `theme=${choice}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    } catch {
      /* cookies disabled */
    }
    void fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: choice }),
      keepalive: true,
    }).catch(() => {});
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className="rounded-full p-2 text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
    >
      {dark === null ? (
        <span className="block h-4 w-4" />
      ) : dark ? (
        /* sun */
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        /* moon */
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
