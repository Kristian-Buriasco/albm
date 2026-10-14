'use client';

import { useEffect, useRef } from 'react';

/**
 * Editorial scroll-reveal: fades + rises its children into view once. Respects
 * prefers-reduced-motion (the CSS no-ops there). Optional stagger via `delay`.
 */
export default function Reveal({
  children,
  className = '',
  delay = 0,
  as: Tag = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: React.ElementType;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Visible by default (SSR / no JS / slow hydration). Only elements below
    // the fold are armed for the fade-in, with a timeout so they can never
    // stay hidden.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add('reveal');
    const failsafe = window.setTimeout(() => el.classList.add('is-visible'), 4000);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).classList.add('is-visible');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={className}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
