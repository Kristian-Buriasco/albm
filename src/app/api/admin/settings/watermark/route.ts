import { requireAdmin } from '@/lib/api';
import { watermarkPath } from '@/lib/paths';
import { streamFileResponse } from '@/lib/stream';

/** Serve the current watermark image for admin preview. */
export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  return streamFileResponse(req, watermarkPath(), {
    contentType: 'image/png',
    cacheControl: 'private, no-cache',
  });
}
