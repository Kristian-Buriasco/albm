import { errorJson, json } from '@/lib/api';
import { applyResults, authorizeWorker, parseResultsBody } from '@/lib/worker-analysis';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!authorizeWorker(req)) return errorJson('Unauthorized', 401);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid JSON body', 400);
  }
  const parsed = parseResultsBody(body);
  if ('error' in parsed) return errorJson(parsed.error, 400);
  return json({ ok: true, ...applyResults(parsed.value) });
}
