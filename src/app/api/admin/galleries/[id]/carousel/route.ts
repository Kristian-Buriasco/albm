import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, json, readJsonObject, requireOwner } from '@/lib/api';
import { logAdmin } from '@/lib/audit-log';
import { candidates, MAX_SLIDES, pickLocal, pickWithClaude, thin, type PickMode } from '@/lib/carousel';
import { taskStatus } from '@/lib/worker-analysis';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Local AI scoring progress (task `score`, run by the worker on your machine) for this gallery. */
export async function GET(_req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  return json({ score: taskStatus('score', id), aiAvailable: Boolean(process.env.ANTHROPIC_API_KEY?.trim()) });
}

/**
 * Pick photos for an Instagram carousel. engine: local (default; uses worker scores when present) or claude
 * (cloud, needs a key). count 2-10; mode spread | top | sections.
 */
export async function POST(req: Request, { params }: Params) {
  const denied = await requireOwner();
  if (denied) return denied;
  const { id } = await params;
  const gallery = getDb().select().from(schema.galleries).where(eq(schema.galleries.id, id)).get();
  if (!gallery) return errorJson('Not found', 404);
  const body = await readJsonObject(req).catch(() => ({}) as Record<string, unknown>);
  const count = Math.min(MAX_SLIDES, Math.max(2, Math.floor(Number(body.count)) || MAX_SLIDES));
  const mode: PickMode = body.mode === 'top' || body.mode === 'sections' ? body.mode : 'spread';
  const engine = body.engine === 'claude' ? 'claude' : 'local';
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  const all = await candidates(id);
  if (all.length < 2) return errorJson('Needs at least 2 ready photos', 400);
  const scored = all.filter((p) => p.score !== undefined).length;

  let picks = pickLocal(all, count, mode);
  let caption = '';
  let source: 'claude' | 'local' = 'local';
  let note: string | null = null;
  if (engine === 'claude') {
    if (!apiKey) note = 'ANTHROPIC_API_KEY is not set on the server; used the local pick.';
    else {
      try {
        const sections =
          mode === 'sections'
            ? new Map(getDb().select().from(schema.sections).where(eq(schema.sections.galleryId, id)).all().map((s) => [s.id, s.title]))
            : undefined;
        const sent = thin(all);
        ({ picks, caption } = await pickWithClaude(sent, id, gallery.title, count, apiKey, sections));
        source = 'claude';
        logAdmin('carousel.ai', { targetType: 'gallery', targetId: id, summary: `Sent ${sent.length} previews of "${gallery.title}" to Anthropic for a carousel` });
      } catch (err) {
        console.error('[carousel] AI pick failed:', err);
        note = 'AI ranking failed; used the local pick.';
      }
    }
  }
  return json({ source, note, scored, total: all.length, caption, picks: picks.map((p) => ({ id: p.id, filename: p.filename })) });
}
