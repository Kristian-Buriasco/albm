import { errorJson, json } from '@/lib/api';
import { authorizeWorker, leaseJobs, parseJobsQuery } from '@/lib/worker-analysis';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!authorizeWorker(req)) return errorJson('Unauthorized', 401);
  const parsed = parseJobsQuery(new URL(req.url).searchParams);
  if ('error' in parsed) return errorJson(parsed.error, 400);
  return json(leaseJobs(parsed.value));
}
