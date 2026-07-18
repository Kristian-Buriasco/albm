import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { getVisitorSession, hasGalleryAccess, isAdmin } from '@/lib/session';
import { previewPhotoId, getReadyPhotos } from '@/lib/public-data';
import { BASE_URL } from '@/lib/env';
import { buildSectionPayloads } from '@/lib/gallery-page-data';
import { isGalleryExpired } from '@/lib/downloads';
import { recordGalleryView } from '@/lib/views';
import { getDistinctPhotoTagsForClientGallery, getPhotoTagMapForClient } from '@/lib/tags';
import { getSetting } from '@/lib/settings';
import { parseLang } from '@/lib/i18n';
import { needsAccessGate, galleryUsesPin } from '@/lib/gallery-auth';
import { listSelectionLists } from '@/lib/selection-lists';
import { getAccountEmail } from '@/lib/magic-links';
import AdminEditLink from '@/components/AdminEditLink';
import PasswordGate from './PasswordGate';
import PinGate from './PinGate';
import GalleryClient from './GalleryClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  // Client galleries are never search-indexed. But when "Link preview" is on,
  // emit an OpenGraph card (cover + title) so sharing the album link shows a
  // preview in chat apps. Only for published, non-gated, non-expired galleries:
  // a gated gallery's image URL would 403 for the unauthenticated crawler
  // (and emitting it would leak nothing but a broken preview).
  const base: Metadata = { robots: { index: false, follow: false } };
  const { slug } = await params;
  const gallery = getDb()
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')))
    .get();
  if (!gallery || !gallery.published || !gallery.socialPreview) return base;
  if (needsAccessGate(gallery) || isGalleryExpired(gallery)) return base;
  const preview = previewPhotoId(gallery);
  if (!preview) return { ...base, title: gallery.title };
  const imageUrl = `${BASE_URL}/img/${preview}/web`;
  return {
    ...base,
    title: gallery.title,
    openGraph: { title: gallery.title, images: [{ url: imageUrl }] },
    twitter: {
      card: 'summary_large_image',
      title: gallery.title,
      images: [imageUrl],
    },
  };
}

export default async function ClientGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')))
    .get();

  const admin = await isAdmin();
  const isPreview = preview === '1' && admin;
  if (!gallery || (!gallery.published && !isPreview)) notFound();
  if (!admin && isGalleryExpired(gallery)) notFound();

  if (gallery.published && !isGalleryExpired(gallery)) {
    const visitorSession = await getVisitorSession(gallery.id);
    let visitorId: string | null = null;
    if (visitorSession.token) {
      const visitor = db
        .select({ id: schema.visitors.id })
        .from(schema.visitors)
        .where(eq(schema.visitors.sessionToken, visitorSession.token))
        .get();
      if (visitor?.id) visitorId = visitor.id;
    }
    await recordGalleryView(gallery.id, visitorId, visitorSession.token ?? null);
  }

  if (!isPreview && needsAccessGate(gallery) && !admin && !(await hasGalleryAccess(gallery.id))) {
    const defaultLang = parseLang(getSetting('defaultLanguage'));
    // Only the cover's blur placeholder (a ~24px data URI) is exposed to a
    // locked visitor — never a real photo — for an ambient gate background.
    const coverId = gallery.previewPhotoId ?? gallery.coverPhotoId;
    const coverPlaceholder = coverId
      ? (db
          .select({ placeholder: schema.photos.placeholder })
          .from(schema.photos)
          .where(eq(schema.photos.id, coverId))
          .get()?.placeholder ?? null)
      : null;
    if (galleryUsesPin(gallery)) {
      return (
        <PinGate slug={slug} title={gallery.title} lang={defaultLang} coverPlaceholder={coverPlaceholder} />
      );
    }
    return (
      <PasswordGate slug={slug} title={gallery.title} lang={defaultLang} coverPlaceholder={coverPlaceholder} />
    );
  }

  const visitorSession = await getVisitorSession(gallery.id);
  let hasVisitor = false;
  let selectedIds: string[] = [];
  let accountEmail: string | null = null;
  let selectionLists: { id: string; name: string }[] = [];
  if (visitorSession.token) {
    const visitor = db
      .select()
      .from(schema.visitors)
      .where(eq(schema.visitors.sessionToken, visitorSession.token))
      .get();
    if (visitor && visitor.galleryId === gallery.id) {
      hasVisitor = true;
      if (visitor.accountId) {
        accountEmail = getAccountEmail(visitor.accountId);
      }
      selectionLists = listSelectionLists(visitor.id, gallery.id).map((l) => ({
        id: l.id,
        name: l.name,
      }));
      selectedIds = db
        .select({ photoId: schema.selections.photoId })
        .from(schema.selections)
        .where(eq(schema.selections.visitorId, visitor.id))
        .all()
        .map((r) => r.photoId);
    }
  }

  const photos = getReadyPhotos(gallery.id);
  const sectionsDb = db
    .select()
    .from(schema.sections)
    .where(eq(schema.sections.galleryId, gallery.id))
    .orderBy(asc(schema.sections.sortOrder))
    .all();
  const sectionGroups = buildSectionPayloads(gallery, photos, sectionsDb);
  const tagOptions = getDistinctPhotoTagsForClientGallery(gallery.id);
  const photoTagIds = getPhotoTagMapForClient(gallery.id);

  return (
    <>
      <AdminEditLink href={`/admin/galleries/${gallery.id}`} label="Edit gallery" />
    <GalleryClient
      slug={slug}
      title={gallery.title}
      eventDate={gallery.eventDate}
      clientInfoMode={gallery.clientInfoMode}
      downloadEnabled={gallery.downloadEnabled}
      favoritesDownloadEnabled={gallery.favoritesDownloadEnabled}
      autoPublishOnUpload={gallery.autoPublishOnUpload}
      downloadOfferWeb={gallery.downloadOfferWeb}
      downloadOfferPrint={gallery.downloadOfferPrint}
      downloadOfferOriginal={gallery.downloadOfferOriginal}
      bibSearch={gallery.bibSearch}
      faceSearch={gallery.faceSearch}
      eventPage={gallery.eventPage}
      sections={sectionGroups}
      hasVisitor={hasVisitor}
      initialSelectedIds={selectedIds}
      initialLists={selectionLists}
      accountEmail={accountEmail}
      commentsEnabled={gallery.commentsMode !== 'off'}
      showExif={gallery.showExif}
      showLocation={gallery.showLocation}
      locationName={gallery.locationName}
      locationLat={gallery.locationLat}
      locationLng={gallery.locationLng}
      selectionLimit={
        gallery.limitSelections && gallery.selectionLimit ? gallery.selectionLimit : null
      }
      photoTagIds={photoTagIds}
      tagOptions={tagOptions}
      defaultLang={parseLang(getSetting('defaultLanguage'))}
    />
    </>
  );
}
