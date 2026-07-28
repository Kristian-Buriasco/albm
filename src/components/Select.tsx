import { forwardRef, type SelectHTMLAttributes } from 'react';

/**
 * Thin wrapper around <select> that strips the native OS chevron
 * (appearance-none) and draws a custom one, so dropdowns match the rest of
 * the site's look instead of the browser's default control. Callers keep
 * full control of their existing className (border, size, spacing) — this
 * only adds the arrow and the room for it.
 */
const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...props }, ref) {
    // A select with `w-full` needs its wrapper to actually take that width too —
    // an inline-block wrapper sizing to a 100%-wide child is a circular layout
    // (both collapse). Every other select is intrinsically sized, where
    // inline-block sizing to content works fine.
    const isBlock = /\bw-full\b/.test(className);
    return (
      <span className={`relative ${isBlock ? 'block w-full' : 'inline-block'}`}>
        <select ref={ref} {...props} className={`appearance-none pr-6 ${className}`}>
          {children}
        </select>
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-1/2 right-1.5 h-3 w-3 -translate-y-1/2 opacity-60"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  },
);

export default Select;
