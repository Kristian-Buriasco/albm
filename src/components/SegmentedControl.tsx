'use client';

export default function SegmentedControl<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="block text-sm">{label}</span>
      {hint && (
        <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
          {hint}
        </span>
      )}
      <div className="mt-2 inline-flex rounded-full border border-neutral-300 p-0.5 dark:border-neutral-700">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              value === opt.value
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-black'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
