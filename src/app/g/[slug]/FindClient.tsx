'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { Lang } from '@/lib/i18n';
import { formatMsg, t } from '@/lib/i18n';
import LanguageSwitcher, { getStoredLang } from '@/components/LanguageSwitcher';

type Props = {
  slug: string;
  title: string;
  eventDate: number | null;
  bibSearch: boolean;
  faceSearch: boolean;
  eventMode?: boolean;
  coverPhotoId?: string | null;
  defaultLang: Lang;
};

export default function FindClient({
  slug,
  title,
  eventDate,
  bibSearch,
  faceSearch,
  eventMode = false,
  coverPhotoId,
  defaultLang,
}: Props) {
  const [lang, setLang] = useState<Lang>(() => getStoredLang() ?? defaultLang);
  const [bib, setBib] = useState('');
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [resultLabel, setResultLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function ensureVisitor() {
    await fetch(`/api/g/${slug}/visitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  }

  async function searchBib(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const n = bib.trim();
      const res = await fetch(`/api/g/${slug}/bib-search?number=${encodeURIComponent(n)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t(lang, 'somethingWrong'));
        setPhotoIds([]);
        setResultLabel(null);
        return;
      }
      setPhotoIds(data.photoIds ?? []);
      setResultLabel(
        (data.count ?? 0) > 0
          ? formatMsg(lang, 'bibMatching', { number: data.number })
          : formatMsg(lang, 'bibNoMatches', { number: data.number }),
      );
    } catch {
      setError(t(lang, 'somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function searchSelfie(file: File) {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('selfie', file);
      const res = await fetch(`/api/g/${slug}/face-search`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t(lang, 'somethingWrong'));
        setPhotoIds([]);
        setResultLabel(null);
        return;
      }
      setPhotoIds(data.photoIds ?? []);
      setResultLabel(
        (data.count ?? 0) > 0
          ? `${data.count} ${t(lang, 'photos')}`
          : t(lang, 'faceNoMatches'),
      );
    } catch {
      setError(t(lang, 'somethingWrong'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function saveMatches() {
    if (photoIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await ensureVisitor();
      const res = await fetch(`/api/g/${slug}/find/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t(lang, 'somethingWrong'));
        return;
      }
      setSaved(true);
    } catch {
      setError(t(lang, 'somethingWrong'));
    } finally {
      setBusy(false);
    }
  }

  const dateLabel =
    eventDate != null
      ? new Date(eventDate).toLocaleDateString(lang === 'nl' ? 'nl-NL' : lang === 'it' ? 'it-IT' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-neutral-500 uppercase">
            {eventMode ? t(lang, 'eventGetPhotos') : t(lang, 'findYourPhotos')}
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-100">
            {title}
          </h1>
          {dateLabel && (
            <p className="mt-1 text-sm text-neutral-500">{dateLabel}</p>
          )}
        </div>
        <LanguageSwitcher lang={lang} onChange={setLang} />
      </div>

      {eventMode && coverPhotoId && (
        <div className="mb-8 overflow-hidden rounded border border-neutral-200 dark:border-neutral-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/img/${coverPhotoId}/web`}
            alt=""
            className="max-h-64 w-full object-cover"
          />
        </div>
      )}

      {faceSearch && (
        <p className="mb-6 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
          {t(lang, 'faceNotice')}
        </p>
      )}

      <div className="space-y-8">
        {bibSearch && (
          <section>
            <h2 className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
              {t(lang, 'bibSearchLabel')}
            </h2>
            <form onSubmit={searchBib} className="flex flex-wrap gap-2">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={bib}
                onChange={(e) => setBib(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t(lang, 'bibSearchPlaceholder')}
                className="min-w-[8rem] flex-1 border-b border-neutral-300 bg-transparent py-2 dark:border-neutral-700"
                aria-label={t(lang, 'bibSearchLabel')}
              />
              <button
                type="submit"
                disabled={busy || bib.length === 0}
                className="border border-neutral-900 px-4 py-2 text-sm disabled:opacity-40 dark:border-neutral-100"
              >
                {t(lang, 'bibSearchButton')}
              </button>
            </form>
            <p className="mt-2 text-xs text-neutral-500">{t(lang, 'findNearbyHint')}</p>
          </section>
        )}

        {faceSearch && (
          <section>
            <h2 className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
              {t(lang, 'faceSearchLabel')}
            </h2>
            <p className="mb-3 text-xs text-neutral-500">{t(lang, 'faceSearchHint')}</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void searchSelfie(f);
              }}
            />
            {busy && (
              <p className="mt-2 text-sm text-neutral-500">{t(lang, 'faceSearching')}</p>
            )}
          </section>
        )}
      </div>

      {error && (
        <p className="mt-6 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {resultLabel && (
        <section className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-medium text-neutral-900 dark:text-neutral-100">
              {resultLabel}
            </h2>
            {photoIds.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveMatches()}
                className="border border-neutral-900 px-3 py-1.5 text-sm dark:border-neutral-100"
              >
                {saved ? t(lang, 'matchesSaved') : t(lang, 'saveMatches')}
              </button>
            )}
          </div>
          {photoIds.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photoIds.map((id) => (
                <li key={id} className="overflow-hidden rounded border border-neutral-200 dark:border-neutral-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/img/${id}/thumb`}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      <p className="mt-12 text-sm">
        <Link
          href={`/g/${slug}`}
          className="text-neutral-600 underline underline-offset-2 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          {t(lang, 'browseGallery')}
        </Link>
      </p>
    </main>
  );
}
