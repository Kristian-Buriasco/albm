import { requireAdmin, json } from '@/lib/api';
import { scanIntegrity } from '@/lib/integrity';
import { allGalleriesStorageUsage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** Owner-only: derivative-integrity report + per-gallery/volume storage usage. */
export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const integrity = scanIntegrity();
  const storage = allGalleriesStorageUsage();
  return json({ integrity, storage });
}
