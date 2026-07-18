'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionedGalleryGrid, {
  HeartIcon,
  Lightbox,
  PhotoComments,
  type LightboxPhoto,
  type SectionGroup,
} from '@/components/SectionedGalleryGrid';
import type { Lang } from '@/lib/i18n';
import { formatMsg, t } from '@/lib/i18n';
import LanguageSwitcher, { getStoredLang } from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';
import ShareTools from '@/components/ShareTools';
import { DEFAULT_LIST_NAME } from '@/lib/selection-constants';
import { CONSENT_COOKIE } from '@/lib/consent';

/** True once the visitor has made any cookie-consent choice. */
function hasConsentChoice(): boolean {
  if (typeof document === 'undefined') return false;
  return new RegExp(`(?:^|; )${CONSENT_COOKIE}=`).test(document.cookie);
}

interface SelectionListInfo {
  id: string;
  name: string;
}

interface Props {
  slug: string;
  title: string;
  eventDate: number | null;
  clientInfoMode: 'off' | 'optional' | 'required';
  downloadEnabled: boolean;
  favoritesDownloadEnabled: boolean;
  autoPublishOnUpload?: boolean;
  downloadOfferWeb?: boolean;
  downloadOfferPrint?: boolean;
  downloadOfferOriginal?: boolean;
  bibSearch?: boolean;
  faceSearch?: boolean;
  eventPage?: boolean;
  sections: SectionGroup[];
  hasVisitor: boolean;
  initialSelectedIds: string[];
  initialLists?: SelectionListInfo[];
  accountEmail?: string | null;
  commentsEnabled: boolean;
  showExif: boolean;
  showLocation: boolean;
  locationName: string | null;
  locationLat: string | null;
  locationLng: string | null;
  selectionLimit: number | null;
  photoTagIds: Record<string, string[]>;
  tagOptions: { id: string; name: string }[];
  defaultLang: Lang;
}

export default function GalleryClient({
  slug,
  title,
  eventDate,
  clientInfoMode,
  downloadEnabled,
  favoritesDownloadEnabled,
  autoPublishOnUpload = false,
  downloadOfferWeb = false,
  downloadOfferPrint = false,
  downloadOfferOriginal = true,
  bibSearch = false,
  faceSearch = false,
  eventPage = false,
  sections: initialSections,
  hasVisitor,
  initialSelectedIds,
  initialLists = [],
  accountEmail = null,
  commentsEnabled,
  showLocation,
  locationName,
  locationLat,
  locationLng,
  selectionLimit,
  photoTagIds,
  tagOptions,
  defaultLang,
}: Props) {
  const [lang, setLang] = useState<Lang>(() => getStoredLang() ?? defaultLang);
  const [sections, setSections] = useState(initialSections);
  const photos = useMemo(() => sections.flatMap((s) => s.photos), [sections]);
  const [visitorReady, setVisitorReady] = useState(hasVisitor);
  const needsInfo = !hasVisitor && clientInfoMode !== 'off';
  // Required mode gates immediately; optional mode holds the welcome modal until
  // the visitor has answered the cookie banner, so the two never stack on entry.
  const [showInfoModal, setShowInfoModal] = useState(
    needsInfo && clientInfoMode === 'required',
  );
  useEffect(() => {
    if (needsInfo && clientInfoMode === 'optional' && hasConsentChoice()) {
      setShowInfoModal(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialSelectedIds),
  );
  const [onlyMine, setOnlyMine] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [downloadConfirm, setDownloadConfirm] = useState<'all' | 'favorites' | null>(null);
  const [downloadInfo, setDownloadInfo] = useState<{ count: number; sizeLabel: string } | null>(null);
  const [zipSize, setZipSize] = useState<'web' | 'print' | 'original'>('original');
  const [lists, setLists] = useState<SelectionListInfo[]>(initialLists);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [showMagicLink, setShowMagicLink] = useState(false);
  const [magicLinkUrl, setMagicLinkUrl] = useState<string | null>(null);
  const [linkedEmail, setLinkedEmail] = useState<string | null>(accountEmail);
  const [newListName, setNewListName] = useState('');
  const [livePulse, setLivePulse] = useState(false);

  const downloadSizes = useMemo((): Array<'web' | 'print' | 'original'> => {
    const sizes: Array<'web' | 'print' | 'original'> = [];
    if (downloadOfferWeb) sizes.push('web');
    if (downloadOfferPrint) sizes.push('print');
    if (downloadOfferOriginal) sizes.push('original');
    return sizes.length > 0 ? sizes : ['original'];
  }, [downloadOfferWeb, downloadOfferPrint, downloadOfferOriginal]);

  useEffect(() => {
    if (downloadSizes.includes(zipSize)) return;
    setZipSize(downloadSizes[0]!);
  }, [downloadSizes, zipSize]);

  useEffect(() => {
    if (!autoPublishOnUpload) return;
    let cancelled = false;
    let since = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(`/api/g/${slug}/live-photos?since=${since}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (typeof data.serverTime === 'number') since = data.serverTime;
        const incoming = (data.photos ?? []) as LightboxPhoto[];
        if (incoming.length === 0) return;
        setLivePulse(true);
        setSections((prev) => {
          const known = new Set(prev.flatMap((s) => s.photos.map((p) => p.id)));
          const fresh = incoming.filter((p) => !known.has(p.id));
          if (fresh.length === 0) return prev;
          if (prev.length === 0) {
            return [{ id: null, title: '', photos: fresh }];
          }
          const next = prev.map((s) => ({ ...s, photos: [...s.photos] }));
          const target = next[0]!;
          target.photos = [...target.photos, ...fresh];
          return next;
        });
      } catch {
        /* ignore */
      }
    };
    const id = window.setInterval(tick, 20_000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [autoPublishOnUpload, slug]);

  const reloadSelections = useCallback(async (listId: string | null) => {
    const q = listId ? `?listId=${encodeURIComponent(listId)}` : '';
    const res = await fetch(`/api/g/${slug}/selections${q}`);
    if (!res.ok) return;
    const data = await res.json();
    setSelected(new Set(data.photoIds ?? []));
    if (data.lists) setLists(data.lists);
  }, [slug]);

  useEffect(() => {
    if (!visitorReady) return;
    reloadSelections(activeListId);
  }, [activeListId, visitorReady, reloadSelections]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('linked') === '1') setLinkedEmail(accountEmail);
  }, [accountEmail]);

  useEffect(() => {
    if (!commentsEnabled) return;
    fetch(`/api/g/${slug}/comments?photoId=_`)
      .catch(() => null);
    // Counts loaded per-photo in lightbox; badge counts from initial server could be added later.
  }, [slug, commentsEnabled]);

  const ensureVisitor = useCallback(async (): Promise<boolean> => {
    if (visitorReady) return true;
    const res = await fetch(`/api/g/${slug}/visitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      setVisitorReady(true);
      return true;
    }
    return false;
  }, [slug, visitorReady]);

  const atLimit = selectionLimit !== null && selected.size >= selectionLimit;

  const toggleSelect = useCallback(
    async (photoId: string) => {
      const isSelected = selected.has(photoId);
      if (!isSelected && atLimit) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (isSelected) next.delete(photoId);
        else next.add(photoId);
        return next;
      });
      if (!(await ensureVisitor())) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (isSelected) next.add(photoId);
          else next.delete(photoId);
          return next;
        });
        return;
      }
      const res = await fetch(`/api/g/${slug}/selections`, {
        method: isSelected ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId, listId: activeListId }),
      });
      if (!res.ok) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (isSelected) next.add(photoId);
          else next.delete(photoId);
          return next;
        });
      }
    },
    [selected, slug, ensureVisitor, atLimit, activeListId],
  );

  async function createList() {
    if (!newListName.trim()) return;
    if (!(await ensureVisitor())) return;
    const res = await fetch(`/api/g/${slug}/selections`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newListName.trim() }),
    });
    if (res.ok) {
      const list = await res.json();
      setLists((prev) => [...prev, list]);
      setActiveListId(list.id);
      setNewListName('');
      await reloadSelections(list.id);
    }
  }

  async function requestMagicLink(email: string) {
    const res = await fetch(`/api/g/${slug}/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      const data = await res.json();
      setMagicLinkUrl(data.url);
    }
  }

  const filteredSections = useMemo(() => {
    if (!onlyMine) return sections;
    return sections
      .map((s) => ({
        ...s,
        photos: s.photos.filter((p) => selected.has(p.id)),
      }))
      .filter((s) => s.photos.length > 0);
  }, [sections, onlyMine, selected]);

  const visible = useMemo(
    () => filteredSections.flatMap((s) => s.photos),
    [filteredSections],
  );

  const gateContent = clientInfoMode === 'required' && showInfoModal;
  const mapUrl =
    showLocation && locationLat && locationLng
      ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(locationLat)}&mlon=${encodeURIComponent(locationLng)}#map=14/${encodeURIComponent(locationLat)}/${encodeURIComponent(locationLng)}`
      : null;

  async function promptDownload(kind: 'all' | 'favorites') {
    const res = await fetch(`/api/g/${slug}/download-info`);
    if (res.ok) {
      const data = await res.json();
      setDownloadInfo({ count: data.count, sizeLabel: data.sizeLabel });
    }
    setDownloadConfirm(kind);
  }

  function recordPhotoView(photoId: string) {
    void fetch(`/api/g/${slug}/photo-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId }),
    });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/90 backdrop-blur dark:border-line-dark/70 dark:bg-paper-dark/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">
              {title}
            </h1>
            {autoPublishOnUpload && (
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-accent dark:text-accent-dark">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${
                    livePulse ? 'animate-pulse' : ''
                  }`}
                />
                {t(lang, 'liveUpdating')}
              </p>
            )}
            {(bibSearch || faceSearch || eventPage) && (
              <p className="mt-0.5 text-[11px]">
                <a
                  href={eventPage ? `/g/${slug}/event` : `/g/${slug}/find`}
                  className="text-muted underline underline-offset-2 hover:text-ink dark:text-muted-dark"
                >
                  {t(lang, 'findYourPhotos')}
                </a>
              </p>
            )}
            <p className="mt-0.5 text-[11px] text-muted dark:text-muted-dark">
              {eventDate
                ? new Date(eventDate).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }) + ' · '
                : ''}
              {photos.length} {t(lang, 'photos')}
              {selected.size > 0 ? ` · ${selected.size} ${t(lang, 'selected')}` : ''}
              {selectionLimit !== null
                ? ` · ${selected.size} ${t(lang, 'selectedOf')} ${selectionLimit} ${t(lang, 'selected')}`
                : ''}
            </p>
            {linkedEmail && (
              <p className="mt-0.5 text-[11px] text-accent dark:text-accent-dark">
                {t(lang, 'selectionsSaved')} · {linkedEmail}
              </p>
            )}
            {showLocation && locationName && (
              <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                {locationName}
                {mapUrl && (
                  <>
                    {' · '}
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      {t(lang, 'viewOnMap')}
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs sm:gap-3">
            {/* Primary action — always visible on every screen size. */}
            <button
              type="button"
              onClick={() => setOnlyMine((v) => !v)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors ${
                onlyMine
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-black'
                  : 'border-neutral-300 text-neutral-600 hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300'
              }`}
            >
              <HeartIcon filled={onlyMine} className="h-3.5 w-3.5" />
              {t(lang, 'mySelections')}
            </button>

            <div className="relative">
              {/* Mobile menu trigger; the controls render inline on sm+. */}
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-label="Options"
                className="flex shrink-0 items-center rounded-full border border-line px-3 py-1.5 sm:hidden dark:border-line-dark"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <circle cx="5" cy="12" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="19" cy="12" r="1.7" />
                </svg>
              </button>
              {menuOpen && (
                <div
                  className="fixed inset-0 z-10 sm:hidden"
                  onClick={() => setMenuOpen(false)}
                  aria-hidden
                />
              )}
              <div
                className={`${menuOpen ? 'flex' : 'hidden'} absolute top-full right-0 z-20 mt-2 w-64 flex-col items-stretch gap-4 rounded-xl border border-line bg-paper p-4 shadow-2xl dark:border-line-dark dark:bg-paper-dark sm:static sm:z-auto sm:mt-0 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none`}
              >
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-muted dark:text-muted-dark">{t(lang, 'selectionLists')}:</span>
                  <button
                    type="button"
                    onClick={() => setActiveListId(null)}
                    className={`rounded-full border px-2 py-0.5 ${
                      activeListId === null ? 'border-ink dark:border-ink-dark' : 'border-line'
                    }`}
                  >
                    {DEFAULT_LIST_NAME}
                  </button>
                  {lists.map((list) => (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => setActiveListId(list.id)}
                      className={`rounded-full border px-2 py-0.5 ${
                        activeListId === list.id ? 'border-ink dark:border-ink-dark' : 'border-line'
                      }`}
                    >
                      {list.name}
                    </button>
                  ))}
                  <input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder={t(lang, 'newList')}
                    className="w-20 border-b border-line bg-transparent py-0.5 dark:border-line-dark"
                  />
                  <button type="button" onClick={createList} className="underline">
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMagicLink(true)}
                  className="text-left underline sm:text-center"
                >
                  {linkedEmail ? t(lang, 'switchDevice') : t(lang, 'saveSelections')}
                </button>
                {downloadEnabled && (
                  <button
                    type="button"
                    onClick={() => promptDownload('all')}
                    className="rounded-full border border-neutral-300 px-3 py-1.5 text-neutral-600 transition-colors hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    {t(lang, 'downloadAll')}
                  </button>
                )}
                {downloadEnabled && favoritesDownloadEnabled && selected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => promptDownload('favorites')}
                    className="rounded-full border border-neutral-300 px-3 py-1.5 text-neutral-600 transition-colors hover:border-neutral-500 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    {t(lang, 'downloadSelections')}
                  </button>
                )}
                <div className="flex items-center justify-between gap-3 sm:contents">
                  <LanguageSwitcher lang={lang} onChange={setLang} />
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {!gateContent && (
        <main className="mx-auto max-w-7xl px-2 py-4 sm:px-4">
          <SectionedGalleryGrid
            sections={filteredSections}
            commentsEnabled={commentsEnabled}
            commentCounts={commentCounts}
            selectedIds={selected}
            photoTagIds={photoTagIds}
            tagOptions={tagOptions}
            onOpenLightbox={setLightbox}
            labels={{
              allSections: t(lang, 'allSections'),
              noPhotos: t(lang, 'noPhotos'),
            }}
            renderTileOverlay={(p: LightboxPhoto) => (
              <button
                type="button"
                onClick={() => toggleSelect(p.id)}
                disabled={!selected.has(p.id) && atLimit}
                aria-label={
                  selected.has(p.id) ? t(lang, 'removeFromSelection') : t(lang, 'addToSelection')
                }
                className={`absolute right-2 bottom-2 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full transition-all ${
                  selected.has(p.id)
                    ? 'bg-accent text-white shadow-lg dark:bg-accent-dark'
                    : 'bg-black/40 text-white/90 backdrop-blur-sm hover:bg-black/60 max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                } disabled:opacity-30`}
              >
                <HeartIcon filled={selected.has(p.id)} className="h-6 w-6" />
              </button>
            )}
          />
        </main>
      )}

      {lightbox !== null && visible.length > 0 && (
        <>
          <Lightbox
            photos={visible}
            index={Math.min(lightbox, visible.length - 1)}
            onClose={() => setLightbox(null)}
            onNavigate={setLightbox}
            showFilename
            selectedIds={selected}
            onToggleSelect={toggleSelect}
            downloadEnabled={downloadEnabled}
            downloadSizes={[...downloadSizes]}
            downloadSizeLabels={{
              web: t(lang, 'downloadSizeWeb'),
              print: t(lang, 'downloadSizePrint'),
              original: t(lang, 'downloadSizeOriginal'),
              label: t(lang, 'downloadSizeLabel'),
            }}
            commentsEnabled={commentsEnabled}
            commentsApiBase={`/api/g/${slug}/comments`}
            onPhotoOpen={recordPhotoView}
            slideshowLabel={{
              play: t(lang, 'slideshowPlay'),
              pause: t(lang, 'slideshowPause'),
            }}
          />
        </>
      )}

      {downloadConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-sm bg-paper p-6 dark:bg-paper-dark">
            <p className="text-sm">
              {formatMsg(lang, 'downloadConfirmTitle', {
                count: downloadInfo?.count ?? photos.length,
                size: downloadInfo?.sizeLabel ?? '?',
              })}
            </p>
            {downloadSizes.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="text-muted dark:text-muted-dark">
                  {t(lang, 'downloadSizeLabel')}:
                </span>
                {downloadSizes.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setZipSize(sz)}
                    className={`rounded-full border px-2 py-0.5 ${
                      zipSize === sz
                        ? 'border-ink dark:border-ink-dark'
                        : 'border-line dark:border-line-dark'
                    }`}
                  >
                    {sz === 'web'
                      ? t(lang, 'downloadSizeWeb')
                      : sz === 'print'
                        ? t(lang, 'downloadSizePrint')
                        : t(lang, 'downloadSizeOriginal')}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                className="flex-1 border py-2 text-xs uppercase"
                onClick={() => setDownloadConfirm(null)}
              >
                {t(lang, 'downloadConfirmCancel')}
              </button>
              <a
                href={
                  downloadConfirm === 'all'
                    ? `/dl/gallery/${slug}.zip?size=${zipSize}`
                    : `/dl/favorites/${slug}.zip?size=${zipSize}${
                        activeListId ? `&listId=${encodeURIComponent(activeListId)}` : ''
                      }`
                }
                className="flex-1 border border-neutral-900 py-2 text-center text-xs uppercase dark:border-neutral-100"
                onClick={() => setDownloadConfirm(null)}
              >
                {t(lang, 'downloadConfirmProceed')}
              </a>
            </div>
          </div>
        </div>
      )}

      {showMagicLink && (
        <MagicLinkModal
          lang={lang}
          initialUrl={magicLinkUrl}
          onClose={() => {
            setShowMagicLink(false);
            setMagicLinkUrl(null);
          }}
          onRequest={requestMagicLink}
        />
      )}

      {showInfoModal && (
        <InfoGateModal
          slug={slug}
          lang={lang}
          required={clientInfoMode === 'required'}
          onDone={() => {
            setShowInfoModal(false);
            setVisitorReady(true);
          }}
        />
      )}
    </div>
  );
}

function MagicLinkModal({
  lang,
  initialUrl,
  onClose,
  onRequest,
}: {
  lang: Lang;
  initialUrl: string | null;
  onClose: () => void;
  onRequest: (email: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(initialUrl);

  useEffect(() => {
    setUrl(initialUrl);
  }, [initialUrl]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    await onRequest(email.trim());
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-md bg-paper p-6 dark:bg-paper-dark">
        <h2 className="text-sm font-medium">{t(lang, 'saveSelections')}</h2>
        {!url ? (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t(lang, 'email')}
              className="w-full border-b border-line bg-transparent py-2 text-sm dark:border-line-dark"
            />
            <button type="submit" disabled={busy} className="w-full border py-2 text-xs uppercase">
              {t(lang, 'continue')}
            </button>
          </form>
        ) : (
          <div className="mt-4">
            <p className="text-xs text-muted dark:text-muted-dark">{t(lang, 'magicLinkInstructions')}</p>
            <ShareTools url={url} />
          </div>
        )}
        <button type="button" onClick={onClose} className="mt-4 text-xs underline">
          {t(lang, 'close')}
        </button>
      </div>
    </div>
  );
}

function InfoGateModal({
  slug,
  lang,
  required,
  onDone,
}: {
  slug: string;
  lang: Lang;
  required: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createVisitor(body: { name?: string; email?: string }) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/g/${slug}/visitor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) onDone();
    else {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? t(lang, 'somethingWrong'));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (required) {
      if (!name.trim()) return setError(t(lang, 'nameRequired'));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return setError(t(lang, 'emailRequired'));
      }
    }
    await createVisitor({
      name: name.trim() || undefined,
      email: email.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-6">
      <div className="w-full max-w-sm bg-[#fafafa] p-8 dark:bg-[#111]">
        <h2 className="text-sm font-medium tracking-widest uppercase">{t(lang, 'welcome')}</h2>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={required ? `${t(lang, 'name')} *` : t(lang, 'name')}
            className="w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none dark:border-neutral-700"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={required ? `${t(lang, 'email')} *` : t(lang, 'email')}
            className="w-full border-b border-neutral-300 bg-transparent py-2 text-sm outline-none dark:border-neutral-700"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className="w-full border py-2 text-xs uppercase">
            {t(lang, 'continue')}
          </button>
          {!required && (
            <button type="button" onClick={() => createVisitor({})} className="w-full text-xs underline">
              {t(lang, 'skip')}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
