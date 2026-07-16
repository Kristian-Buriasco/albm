import { asc, eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { errorJson, requireAdmin } from '@/lib/api';
import { listNameForSelection } from '@/lib/selection-lists';

type Params = { params: Promise<{ id: string }> };

function csvEscape(v: string): string {
  let s = v;
  if (s && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export async function GET(_req: Request, { params }: Params) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;

  const db = getDb();
  const gallery = db
    .select()
    .from(schema.galleries)
    .where(eq(schema.galleries.id, id))
    .get();
  if (!gallery) return errorJson('Not found', 404);

  const rows = db
    .select({
      filename: schema.photos.filename,
      name: schema.visitors.name,
      email: schema.visitors.email,
      selectedAt: schema.selections.createdAt,
      listId: schema.selections.listId,
    })
    .from(schema.selections)
    .innerJoin(schema.photos, eq(schema.selections.photoId, schema.photos.id))
    .innerJoin(schema.visitors, eq(schema.selections.visitorId, schema.visitors.id))
    .where(eq(schema.photos.galleryId, id))
    .orderBy(asc(schema.photos.filename))
    .all();

  const lines = ['filename,visitor_name,visitor_email,list_name,selected_at'];
  for (const r of rows) {
    lines.push(
      [
        csvEscape(r.filename),
        csvEscape(r.name ?? ''),
        csvEscape(r.email ?? ''),
        csvEscape(listNameForSelection(r.listId)),
        csvEscape(new Date(r.selectedAt).toISOString()),
      ].join(','),
    );
  }

  return new Response(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="selections-${gallery.slug}.csv"`,
    },
  });
}
