import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { json, requireAdmin } from '@/lib/api';
import { pendingCommentCount } from '@/lib/comments';

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const status = new URL(req.url).searchParams.get('status') ?? 'pending';
  const db = getDb();

  if (status === 'pending') {
    const rows = db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.status, 'pending'))
      .all();
    return json({ count: rows.length, comments: rows });
  }

  return json({ count: pendingCommentCount() });
}
