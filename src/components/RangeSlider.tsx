'use client';

/**
 * Custom-styled range slider — strips the OS-native track/thumb look (same
 * motivation as Select.tsx for dropdowns) and draws the site's own: a thin
 * line with an accent-filled portion up to the current value, and a small
 * circular thumb. Native <input type="range"> underneath for full a11y/
 * keyboard/touch support — only the paint changes.
 */
export default function RangeSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  className = '',
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`range-slider w-full ${className}`}
      style={{
        // Paints the filled (accent) portion up to the thumb and the
        // remaining track in the line color, via a hard-stop gradient —
        // recomputed on every value change since the split point moves.
        background: `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-line) ${pct}%)`,
      }}
    />
  );
}
