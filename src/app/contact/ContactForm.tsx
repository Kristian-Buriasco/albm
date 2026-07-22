'use client';

import { useState } from 'react';

const EVENT_TYPES = [
  { value: '', label: 'What is the occasion?' },
  { value: 'wedding', label: 'Wedding' },
  { value: 'event', label: 'Event' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'other', label: 'Something else' },
];

const fieldClass =
  'w-full border border-line bg-transparent px-3 py-2.5 text-[15px] text-ink outline-none transition-colors focus:border-accent dark:border-line-dark dark:text-ink-dark dark:focus:border-accent-dark';
const labelClass =
  'mb-1.5 block text-[11px] tracking-[0.12em] text-muted uppercase dark:text-muted-dark';

export default function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');
    setError('');
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setStatus('sent');
        form.reset();
      } else {
        const j = await res.json().catch(() => ({}));
        setError(j.error || 'Something went wrong. Please try again.');
        setStatus('error');
      }
    } catch {
      setError('Network error. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="border border-line px-6 py-10 text-center dark:border-line-dark">
        <p className="display text-xl font-medium">Message sent.</p>
        <p className="mt-2 text-[14px] text-muted dark:text-muted-dark">
          Thanks for reaching out — I&apos;ll get back to you soon.
        </p>
        <button
          type="button"
          onClick={() => setStatus('idle')}
          className="mt-6 text-[13px] text-accent underline-offset-4 hover:underline dark:text-accent-dark"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {/* Honeypot: hidden from humans, tempting to bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="c-name">
            Name
          </label>
          <input id="c-name" name="name" type="text" required maxLength={120} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="c-email">
            Email
          </label>
          <input id="c-email" name="email" type="email" required maxLength={200} className={fieldClass} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="c-type">
            Type
          </label>
          <select id="c-type" name="eventType" className={fieldClass} defaultValue="">
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="c-date">
            Date (if known)
          </label>
          <input id="c-date" name="eventDate" type="date" className={fieldClass} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="c-message">
          Message
        </label>
        <textarea
          id="c-message"
          name="message"
          required
          rows={5}
          maxLength={4000}
          className={`${fieldClass} resize-y`}
          placeholder="Tell me a little about what you have in mind."
        />
      </div>

      {status === 'error' && (
        <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="border border-ink px-6 py-2.5 text-[13px] tracking-wide transition-colors hover:bg-ink hover:text-paper disabled:opacity-50 dark:border-ink-dark dark:hover:bg-ink-dark dark:hover:text-paper-dark"
      >
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
