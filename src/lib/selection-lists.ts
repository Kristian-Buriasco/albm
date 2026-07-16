import { and, asc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';

export const MAX_LISTS_PER_VISITOR = 5;
import { DEFAULT_LIST_NAME } from '@/lib/selection-constants';

export function listSelectionLists(visitorId: string, galleryId: string) {
  return getDb()
    .select()
    .from(schema.selectionLists)
    .where(
      and(
        eq(schema.selectionLists.visitorId, visitorId),
        eq(schema.selectionLists.galleryId, galleryId),
      ),
    )
    .orderBy(asc(schema.selectionLists.createdAt))
    .all();
}

export function countSelectionLists(visitorId: string, galleryId: string): number {
  return (
    getDb()
      .select({ c: sql<number>`count(*)` })
      .from(schema.selectionLists)
      .where(
        and(
          eq(schema.selectionLists.visitorId, visitorId),
          eq(schema.selectionLists.galleryId, galleryId),
        ),
      )
      .get()?.c ?? 0
  );
}

export function createSelectionList(
  visitorId: string,
  galleryId: string,
  name: string,
): typeof schema.selectionLists.$inferSelect | null {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) return null;
  if (countSelectionLists(visitorId, galleryId) >= MAX_LISTS_PER_VISITOR) return null;

  const row = {
    id: nanoid(),
    galleryId,
    visitorId,
    name: trimmed,
  };
  getDb().insert(schema.selectionLists).values(row).run();
  return getDb()
    .select()
    .from(schema.selectionLists)
    .where(eq(schema.selectionLists.id, row.id))
    .get()!;
}

export function resolveListId(
  visitorId: string,
  galleryId: string,
  listId: string | null | undefined,
): string | null {
  if (!listId) return null;
  const list = getDb()
    .select()
    .from(schema.selectionLists)
    .where(eq(schema.selectionLists.id, listId))
    .get();
  if (!list || list.visitorId !== visitorId || list.galleryId !== galleryId) return null;
  return list.id;
}

export function listNameForSelection(listId: string | null): string {
  if (!listId) return DEFAULT_LIST_NAME;
  const list = getDb()
    .select({ name: schema.selectionLists.name })
    .from(schema.selectionLists)
    .where(eq(schema.selectionLists.id, listId))
    .get();
  return list?.name ?? DEFAULT_LIST_NAME;
}
