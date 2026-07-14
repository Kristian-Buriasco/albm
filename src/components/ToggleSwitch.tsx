'use client';

export default function ToggleSwitch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-xs text-neutral-500 dark:text-neutral-400">
            {hint}
          </span>
        )}
      </span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-neutral-300 transition-colors peer-checked:bg-neutral-900 peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-400 dark:bg-neutral-700 dark:peer-checked:bg-neutral-100" />
        <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 dark:bg-neutral-900 dark:peer-checked:bg-black" />
      </span>
    </label>
  );
}
