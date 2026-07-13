import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { getVisitorSession, hasGalleryAccess, isAdmin } from '@/lib/session';
import { getReadyPhotos } from '@/lib/public-data';
import PasswordGate from './PasswordGate';
import GalleryClient from './GalleryClient';

export const dynamic = 'force-dynamic';

export default async function ClientGalleryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(
      and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')),
    )
    .get();

  const admin = await isAdmin();
  // Unknown or unpublished => 404, don't reveal existence (admin may preview).
  if (!gallery || (!gallery.published && !admin)) notFound();

  if (gallery.passwordHash && !admin && !(await hasGalleryAccess(gallery.id))) {
    return <PasswordGate slug={slug} title={gallery.title} />;
  }

  // Existing visitor (cookie) — if present, we never show the info modal again.
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

  const photos = getReadyPhotos(gallery.id).map((p) => ({
    id: p.id,
    filename: p.filename,
    width: p.width,
    height: p.height,
  }));

  return (
    <GalleryClient
      slug={slug}
      title={gallery.title}
      eventDate={gallery.eventDate}
      clientInfoMode={gallery.clientInfoMode}
      downloadEnabled={gallery.downloadEnabled}
      photos={photos}
      hasVisitor={hasVisitor}
      initialSelectedIds={selectedIds}
    />
  );
}
