import { errorJson, json } from '@/lib/api';
import { ANALYSIS_TASKS, authorizeWorker, taskStatus } from '@/lib/worker-analysis';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!authorizeWorker(req)) return errorJson('Unauthorized', 401);
  const galleryId = new URL(req.url).searchParams.get('gallery') || null;
  const tasks = Object.fromEntries(ANALYSIS_TASKS.map((t) => [t, taskStatus(t, galleryId)]));
  return json({ tasks });
}
