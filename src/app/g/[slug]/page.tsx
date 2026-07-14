import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { getVisitorSession, hasGalleryAccess, isAdmin } from '@/lib/session';
import { getReadyPhotos } from '@/lib/public-data';
import { buildSectionPayloads } from '@/lib/gallery-page-data';
import { isGalleryExpired } from '@/lib/downloads';
import { recordGalleryView } from '@/lib/views';
import PasswordGate from './PasswordGate';
import GalleryClient from './GalleryClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    robots: { index: false, follow: false },
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

  if (!isPreview && gallery.passwordHash && !admin && !(await hasGalleryAccess(gallery.id))) {
    return <PasswordGate slug={slug} title={gallery.title} />;
  }

  const visitorSession = await getVisitorSession(gallery.id);
  let hasVisitor = false;
  let selectedIds: string[] = [];
  if (visitorSession.token) {
    const visitor = db
      .select()
      .from(schema.visitors)
      .where(eq(schema.visitors.sessionToken, visitorSession.token))
      .get();
    if (visitor && visitor.galleryId === gallery.id) {
      hasVisitor = true;
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

  return (
    <GalleryClient
      slug={slug}
      title={gallery.title}
      eventDate={gallery.eventDate}
      clientInfoMode={gallery.clientInfoMode}
      downloadEnabled={gallery.downloadEnabled}
      favoritesDownloadEnabled={gallery.favoritesDownloadEnabled}
      sections={sectionGroups}
      hasVisitor={hasVisitor}
      initialSelectedIds={selectedIds}
      commentsEnabled={gallery.commentsMode !== 'off'}
      showExif={gallery.showExif}
      showLocation={gallery.showLocation}
      locationName={gallery.locationName}
      locationLat={gallery.locationLat}
      locationLng={gallery.locationLng}
      selectionLimit={
        gallery.limitSelections && gallery.selectionLimit ? gallery.selectionLimit : null
      }
    />
  );
}
