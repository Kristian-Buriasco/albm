'use client';

import { useEffect, useRef, useState } from 'react';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/**
 * Site-styled stand-in for <input type="date">. Submits `YYYY-MM-DD` through a
 * hidden input named `name`, so FormData consumers (ContactForm) are unchanged.
 */
export default function DatePicker({
  id,
  name,
  className,
}: {
  id?: string;
  name: string;
  className?: string;
}) {
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState(false); // month grid instead of days
  const today = new Date();
  const [view, setView] = useState({
    y: today.getFullYear(),
    m: today.getMonth(),
  });
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setMonths(false);
      return;
    }
    const away = (e: MouseEvent) =>
      !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const shift = (d: number) =>
    setView(({ y, m }) => {
      const t = months ? new Date(y + d, m, 1) : new Date(y, m + d, 1);
      return { y: t.getFullYear(), m: t.getMonth() };
    });
  const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // Monday-first
  const count = new Date(view.y, view.m + 1, 0).getDate();
  const todayIso = iso(today.getFullYear(), today.getMonth(), today.getDate());
  const label = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Select a date';
  const nav =
    'px-2 py-1 text-muted transition-colors hover:text-ink dark:text-muted-dark dark:hover:text-ink-dark';

  return (
    <div ref={root} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${className ?? ''} flex items-center justify-between text-left ${value ? '' : 'text-muted dark:text-muted-dark'}`}
      >
        <span>{label}</span>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" />
          <path d="M3 10h18M8 3v4m8-4v4" />
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Choose a date"
          className="absolute left-0 z-30 mt-1 w-72 max-w-full border border-line bg-paper p-3 text-sm shadow-lg dark:border-line-dark dark:bg-paper-dark"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label={months ? 'Previous year' : 'Previous month'}
              className={nav}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Choose month"
              onClick={() => setMonths((v) => !v)}
              className="text-[13px] tracking-wide transition-colors hover:text-accent dark:hover:text-accent-dark"
            >
              {months
                ? view.y
                : new Date(view.y, view.m, 1).toLocaleDateString('en-GB', {
                    month: 'long',
                    year: 'numeric',
                  })}
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label={months ? 'Next year' : 'Next month'}
              className={nav}
            >
              ›
            </button>
          </div>
          {months ? (
            <div className="grid grid-cols-3 text-center">
              {Array.from({ length: 12 }, (_, m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setView((v) => ({ ...v, m }));
                    setMonths(false);
                  }}
                  className={`py-2 transition-colors hover:bg-line dark:hover:bg-line-dark ${
                    m === view.m ? 'text-accent dark:text-accent-dark' : ''
                  }`}
                >
                  {new Date(2000, m, 1).toLocaleDateString('en-GB', {
                    month: 'short',
                  })}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 text-center text-[11px] text-muted uppercase dark:text-muted-dark">
                {DAYS.map((d) => (
                  <span key={d} className="py-1">
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 text-center">
                {Array.from({ length: lead }, (_, i) => (
                  <span key={`b${i}`} />
                ))}
                {Array.from({ length: count }, (_, i) => {
                  const v = iso(view.y, view.m, i + 1);
                  const sel = v === value;
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={sel}
                      onClick={() => {
                        setValue(sel ? '' : v);
                        setOpen(false);
                      }}
                      className={`py-1.5 transition-colors ${
                        sel
                          ? 'bg-accent text-paper dark:bg-accent-dark dark:text-paper-dark'
                          : `hover:bg-line dark:hover:bg-line-dark ${v === todayIso ? 'text-accent dark:text-accent-dark' : ''}`
                      }`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {value && !months && (
            <button
              type="button"
              onClick={() => {
                setValue('');
                setOpen(false);
              }}
              className="mt-2 text-[12px] text-muted underline dark:text-muted-dark"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
