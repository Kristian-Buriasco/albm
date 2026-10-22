import { desc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { json, requireAdmin } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Contact-form inquiries, newest first. `?status=new|read|archived` filters. The abuse hash is never returned. */
export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const status = new URL(req.url).searchParams.get('status');
  const q = getDb().select().from(schema.inquiries);
  const rows = (status === 'new' || status === 'read' || status === 'archived' ? q.where(eq(schema.inquiries.status, status)) : q)
    .orderBy(desc(schema.inquiries.createdAt))
    .limit(200)
    .all();
  return json({
    inquiries: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      eventType: r.eventType,
      eventDate: r.eventDate,
      message: r.message,
      status: r.status,
      createdAt: r.createdAt,
    })),
  });
}
