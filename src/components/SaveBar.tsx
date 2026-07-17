'use client';

export default function SaveBar({
  onSave,
  saving,
  saved,
  dirty = true,
  label = 'Save',
}: {
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  dirty?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saving || !dirty}
      className="border border-neutral-900 px-6 py-2 text-xs tracking-widest uppercase transition-colors hover:bg-neutral-900 hover:text-white disabled:opacity-40 dark:border-neutral-100 dark:hover:bg-neutral-100 dark:hover:text-black"
    >
      {saving ? 'Saving…' : saved ? 'Saved' : label}
    </button>
  );
}
