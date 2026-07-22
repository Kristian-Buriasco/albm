'use client';

import { useState } from 'react';
import SettingsCard from '@/components/SettingsCard';
import SaveBar from '@/components/SaveBar';

const inputClass =
  'w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100';
const labelClass = 'mb-2 block text-xs text-neutral-500 dark:text-neutral-400';

export default function EmailSettings({
  initialHost,
  initialPort,
  initialUser,
  initialFrom,
  initialTo,
  passSet,
}: {
  initialHost: string;
  initialPort: string;
  initialUser: string;
  initialFrom: string;
  initialTo: string;
  passSet: boolean;
}) {
  const [host, setHost] = useState(initialHost);
  const [port, setPort] = useState(initialPort);
  const [user, setUser] = useState(initialUser);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [pass, setPass] = useState('');
  const [clearPass, setClearPass] = useState(false);
  const [hasPass, setHasPass] = useState(passSet);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    setTestMsg(null);
    const body: Record<string, unknown> = {
      smtpHost: host,
      smtpPort: port,
      smtpUser: user,
      smtpFrom: from,
      smtpTo: to,
    };
    if (clearPass) body.smtpPassClear = true;
    else if (pass) body.smtpPass = pass;
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      if (clearPass) setHasPass(false);
      else if (pass) setHasPass(true);
      setPass('');
      setClearPass(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch('/api/admin/settings/smtp-test', { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      setTestMsg(
        res.ok
          ? { ok: true, text: `Test email sent to ${j.to}.` }
          : { ok: false, text: j.error || 'Test failed.' },
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <SettingsCard
        title="Email (SMTP)"
        description="Optional. When set, new contact inquiries email you. Leave blank to keep email off — leads are still saved to the Inquiries inbox. These override SMTP_* environment variables."
      >
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
            <label className="block">
              <span className={labelClass}>SMTP host</span>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="smtp.example.com"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Port</span>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="587"
                inputMode="numeric"
                className={inputClass}
              />
            </label>
          </div>

          <label className="block">
            <span className={labelClass}>Username</span>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>
              Password {hasPass && <span className="text-neutral-400">· a password is saved</span>}
            </span>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder={hasPass ? '•••••••• (unchanged)' : ''}
              autoComplete="new-password"
              disabled={clearPass}
              className={inputClass}
            />
          </label>
          {hasPass && (
            <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={clearPass}
                onChange={(e) => setClearPass(e.target.checked)}
              />
              Clear the saved password
            </label>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>From address</span>
              <input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="Albm <noreply@example.com>"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Notify to (defaults to contact email)</span>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </label>
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="button"
              onClick={sendTest}
              disabled={testing}
              className="border border-neutral-300 px-4 py-1.5 text-xs transition-colors hover:border-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:hover:border-neutral-100"
            >
              {testing ? 'Sending…' : 'Send test email'}
            </button>
            {testMsg && (
              <span
                className={`text-xs ${
                  testMsg.ok
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {testMsg.text}
              </span>
            )}
          </div>
        </div>
      </SettingsCard>

      <SaveBar onSave={save} saving={saving} saved={saved} />
    </div>
  );
}
