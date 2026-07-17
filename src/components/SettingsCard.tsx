export default function SettingsCard({
  title,
  description,
  tone = 'default',
  footer,
  children,
}: {
  title?: string;
  description?: string;
  tone?: 'default' | 'danger';
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const danger = tone === 'danger';
  return (
    <section
      className={`rounded-lg border p-6 ${
        danger
          ? 'border-red-300 dark:border-red-900/60'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}
    >
      {(title || description) && (
        <header className="mb-5">
          {title && (
            <h2
              className={`text-xs font-medium tracking-widest uppercase ${
                danger
                  ? 'text-red-600 dark:text-red-500'
                  : 'text-neutral-500 dark:text-neutral-400'
              }`}
            >
              {title}
            </h2>
          )}
          {description && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
          )}
        </header>
      )}
      <div className="space-y-4">{children}</div>
      {footer && <div className="mt-6 flex justify-end">{footer}</div>}
    </section>
  );
}
