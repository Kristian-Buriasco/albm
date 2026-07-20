import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { getSetting } from '@/lib/settings';
import { parseLang } from '@/lib/i18n';
import { needsAccessGate, galleryUsesPin } from '@/lib/gallery-auth';
import { hasGalleryAccess, isAdmin } from '@/lib/session';
import { isGalleryExpired } from '@/lib/downloads';
import PasswordGate from '../PasswordGate';
import PinGate from '../PinGate';
import KioskView from './KioskView';

export const dynamic = 'force-dynamic';

/** Live event wall / kiosk mode. Same access gate as the gallery itself. */
export default async function KioskPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(and(eq(schema.galleries.slug, slug), eq(schema.galleries.type, 'client')))
    .get();

  const admin = await isAdmin();
  if (!gallery || (!gallery.published && !admin)) notFound();
  if (!admin && isGalleryExpired(gallery)) notFound();
  if (!gallery.kioskEnabled) notFound();

  if (needsAccessGate(gallery) && !admin && !(await hasGalleryAccess(gallery.id))) {
    const defaultLang = parseLang(getSetting('defaultLanguage'));
    if (galleryUsesPin(gallery)) {
      return <PinGate slug={slug} title={gallery.title} lang={defaultLang} />;
    }
    return <PasswordGate slug={slug} title={gallery.title} lang={defaultLang} />;
  }

  const photos = db
    .select({
      id: schema.photos.id,
      filename: schema.photos.filename,
      width: schema.photos.width,
      height: schema.photos.height,
      updatedAt: schema.photos.updatedAt,
      placeholder: schema.photos.placeholder,
    })
    .from(schema.photos)
    .where(and(eq(schema.photos.galleryId, gallery.id), eq(schema.photos.status, 'ready')))
    .orderBy(desc(schema.photos.createdAt))
    .all();

  return <KioskView slug={slug} title={gallery.title} initialPhotos={photos} />;
}
