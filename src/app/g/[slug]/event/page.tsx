import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { getSetting } from '@/lib/settings';
import { parseLang } from '@/lib/i18n';
import { needsAccessGate, galleryUsesPin } from '@/lib/gallery-auth';
import { hasGalleryAccess, isAdmin } from '@/lib/session';
import { isGalleryExpired } from '@/lib/downloads';
import { previewPhotoId } from '@/lib/public-data';
import PasswordGate from '../PasswordGate';
import PinGate from '../PinGate';
import FindClient from '../FindClient';

export const dynamic = 'force-dynamic';

/** Public event landing (3C) — venue QR target. Default off via eventPage option. */
export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
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
  if (!gallery.eventPage) notFound();

  if (needsAccessGate(gallery) && !admin && !(await hasGalleryAccess(gallery.id))) {
    const defaultLang = parseLang(getSetting('defaultLanguage'));
    if (galleryUsesPin(gallery)) {
      return <PinGate slug={slug} title={gallery.title} lang={defaultLang} />;
    }
    return <PasswordGate slug={slug} title={gallery.title} lang={defaultLang} />;
  }

  const cover = previewPhotoId(gallery);

  return (
    <FindClient
      slug={slug}
      title={gallery.title}
      eventDate={gallery.eventDate}
      bibSearch={gallery.bibSearch}
      faceSearch={gallery.faceSearch}
      eventMode
      coverPhotoId={cover}
      defaultLang={parseLang(getSetting('defaultLanguage'))}
    />
  );
}
