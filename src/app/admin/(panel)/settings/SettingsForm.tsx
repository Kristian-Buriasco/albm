'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SettingsCard from '@/components/SettingsCard';
import SaveBar from '@/components/SaveBar';

export default function SettingsForm({
  initialAbout,
  initialContact,
  initialAnalyticsHeadHtml,
  initialHomeEyebrow,
  initialHomeHeadline,
  initialHomeIntro,
  initialContactEmail,
  initialContactInstagram,
  initialContactWhatsapp,
  initialFooterContent,
  initialDefaultLanguage,
  hasWatermark,
}: {
  initialAbout: string;
  initialContact: string;
  initialAnalyticsHeadHtml: string;
  initialHomeEyebrow: string;
  initialHomeHeadline: string;
  initialHomeIntro: string;
  initialContactEmail: string;
  initialContactInstagram: string;
  initialContactWhatsapp: string;
  initialFooterContent: string;
  initialDefaultLanguage: string;
  hasWatermark: boolean;
}) {
  const router = useRouter();
  const [about, setAbout] = useState(initialAbout);
  const [contact, setContact] = useState(initialContact);
  const [analyticsHeadHtml, setAnalyticsHeadHtml] = useState(
    initialAnalyticsHeadHtml,
  );
  const [homeEyebrow, setHomeEyebrow] = useState(initialHomeEyebrow);
  const [homeHeadline, setHomeHeadline] = useState(initialHomeHeadline);
  const [homeIntro, setHomeIntro] = useState(initialHomeIntro);
  const [contactEmail, setContactEmail] = useState(initialContactEmail);
  const [contactInstagram, setContactInstagram] = useState(initialContactInstagram);
  const [contactWhatsapp, setContactWhatsapp] = useState(initialContactWhatsapp);
  const [footer, setFooter] = useState(initialFooterContent);
  const [defaultLanguage, setDefaultLanguage] = useState(initialDefaultLanguage);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [wmBusy, setWmBusy] = useState(false);
  const [wmVersion, setWmVersion] = useState(0);

  async function saveText() {
    setSaving(true);
    setSaved(false);
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aboutContent: about,
        contactContent: contact,
        analyticsHeadHtml,
        homeEyebrow,
        homeHeadline,
        homeIntro,
        contactEmail,
        contactInstagram,
        contactWhatsapp,
        footerContent: footer,
        defaultLanguage,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }

  async function uploadWatermark(file: File) {
    setWmBusy(true);
    const form = new FormData();
    form.append('watermark', file);
    const res = await fetch('/api/admin/settings', { method: 'POST', body: form });
    setWmBusy(false);
    if (res.ok) {
      setWmVersion((v) => v + 1);
      router.refresh();
    } else {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? 'Upload failed');
    }
  }

  async function removeWatermark() {
    if (!confirm('Remove the watermark image?')) return;
    setWmBusy(true);
    await fetch('/api/admin/settings', { method: 'DELETE' });
    setWmBusy(false);
    router.refresh();
  }

  const textareaClass =
    'w-full border border-neutral-300 bg-transparent p-3 text-sm leading-6 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-neutral-100';
  const inputClass =
    'w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700';
  const labelClass = 'mb-2 block text-xs text-neutral-500 dark:text-neutral-400';

  return (
    <div className="max-w-2xl space-y-8">
      <SettingsCard
        title="Homepage"
        description="Hero copy shown at the top of the public homepage."
      >
        <label className="block">
          <span className={labelClass}>Homepage eyebrow</span>
          <input
            value={homeEyebrow}
            onChange={(e) => setHomeEyebrow(e.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Homepage headline</span>
          <input
            value={homeHeadline}
            onChange={(e) => setHomeHeadline(e.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Homepage intro</span>
          <textarea
            value={homeIntro}
            onChange={(e) => setHomeIntro(e.target.value)}
            rows={4}
            maxLength={2000}
            className={textareaClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Default client gallery language</span>
          <select
            value={defaultLanguage}
            onChange={(e) => setDefaultLanguage(e.target.value)}
            className="border-b border-neutral-300 bg-transparent py-2 text-sm outline-none dark:border-neutral-700"
          >
            <option value="en">English</option>
            <option value="nl">Nederlands</option>
            <option value="it">Italiano</option>
          </select>
        </label>
      </SettingsCard>

      <SettingsCard
        title="About & Contact"
        description="About/contact page copy and the handles shown on the public contact page."
      >
        <label className="block">
          <span className={labelClass}>Contact email (optional)</span>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Instagram handle</span>
          <input
            value={contactInstagram}
            onChange={(e) => setContactInstagram(e.target.value)}
            maxLength={200}
            placeholder="_kri14_"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>WhatsApp number or link</span>
          <input
            value={contactWhatsapp}
            onChange={(e) => setContactWhatsapp(e.target.value)}
            maxLength={200}
            placeholder="kristianburiasco"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>About page content</span>
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={8}
            className={textareaClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Contact page content</span>
          <textarea
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            rows={6}
            className={textareaClass}
          />
        </label>
      </SettingsCard>

      <SettingsCard
        title="Footer & Language"
        description="Footer text shown at the bottom of public pages."
      >
        <label className="block">
          <span className={labelClass}>Footer text</span>
          <textarea
            value={footer}
            onChange={(e) => setFooter(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="e.g. Based in Torino · Available worldwide"
            className={textareaClass}
          />
        </label>
      </SettingsCard>

      <SettingsCard
        title="Analytics"
        description="Optional HTML pasted into the public site's <head> (e.g. GA4 or Umami). Executed as-is on public pages only — never on /admin. Leave empty to disable."
      >
        <textarea
          value={analyticsHeadHtml}
          onChange={(e) => setAnalyticsHeadHtml(e.target.value)}
          rows={6}
          className={textareaClass}
          placeholder='<script async src="https://…"></script>'
        />
      </SettingsCard>

      <SettingsCard
        title="Watermark"
        description="PNG with transparency. Composited on web-size images of galleries with watermarking enabled. Saved immediately on upload."
      >
        {hasWatermark && (
          <div className="inline-block bg-neutral-200 p-4 dark:bg-neutral-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/admin/settings/watermark?v=${wmVersion}`}
              alt="Current watermark"
              className="max-h-24"
            />
          </div>
        )}
        <div className="flex items-center gap-3 text-xs">
          <label className="cursor-pointer border border-neutral-300 px-4 py-1.5 tracking-widest uppercase transition-colors hover:border-neutral-900 dark:border-neutral-700 dark:hover:border-neutral-100">
            {wmBusy ? 'Working…' : hasWatermark ? 'Replace' : 'Upload PNG'}
            <input
              type="file"
              accept="image/png"
              hidden
              disabled={wmBusy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadWatermark(f);
                e.target.value = '';
              }}
            />
          </label>
          {hasWatermark && (
            <button
              type="button"
              disabled={wmBusy}
              onClick={removeWatermark}
              className="text-neutral-500 underline underline-offset-4 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Remove
            </button>
          )}
        </div>
      </SettingsCard>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <div className="rounded-full bg-white/80 p-1 backdrop-blur dark:bg-black/70">
          <SaveBar onSave={saveText} saving={saving} saved={saved} label="Save changes" />
        </div>
      </div>
    </div>
  );
}
