import { and, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';

export type DeliveryState = 'proofing' | 'retouching' | 'delivered';
export const DELIVERY_STATES: DeliveryState[] = ['proofing', 'retouching', 'delivered'];

export function isDeliveryState(v: unknown): v is DeliveryState {
  return typeof v === 'string' && (DELIVERY_STATES as string[]).includes(v);
}

export interface Actor {
  type: string;
  id: string | null;
}

export interface TimelineItem {
  at: number;
  kind: 'created' | 'first_view' | 'first_selection' | 'state_change' | 'note';
  from?: string | null;
  to?: string | null;
  note?: string | null;
}

/** Update a gallery's delivery state and log the transition. Returns false if unchanged. */
export function setDeliveryState(
  galleryId: string,
  state: DeliveryState,
  actor: Actor,
): boolean {
  const db = getDb();
  const gallery = db
    .select({ deliveryState: schema.galleries.deliveryState })
    .from(schema.galleries)
    .where(eq(schema.galleries.id, galleryId))
    .get();
  if (!gallery) return false;
  const from = gallery.deliveryState;
  if (from === state) return false;

  db.update(schema.galleries)
    .set({ deliveryState: state, updatedAt: Date.now() })
    .where(eq(schema.galleries.id, galleryId))
    .run();
  db.insert(schema.galleryEvents)
    .values({
      galleryId,
      type: 'state_change',
      fromState: from,
      toState: state,
      actorType: actor.type,
      actorId: actor.id,
    })
    .run();
  return true;
}

export function addGalleryNote(galleryId: string, note: string, actor: Actor): void {
  const trimmed = note.trim();
  if (!trimmed) return;
  getDb()
    .insert(schema.galleryEvents)
    .values({
      galleryId,
      type: 'note',
      note: trimmed.slice(0, 1000),
      actorType: actor.type,
      actorId: actor.id,
    })
    .run();
}

/** Merged, newest-first delivery timeline: derived milestones + logged events. */
export function getGalleryTimeline(galleryId: string): TimelineItem[] {
  const db = getDb();
  const items: TimelineItem[] = [];

  const gallery = db
    .select({ createdAt: schema.galleries.createdAt })
    .from(schema.galleries)
    .where(eq(schema.galleries.id, galleryId))
    .get();
  if (!gallery) return [];
  items.push({ at: gallery.createdAt, kind: 'created' });

  const firstView = db
    .select({ at: sql<number>`min(${schema.viewEvents.createdAt})` })
    .from(schema.viewEvents)
    .where(
      and(
        eq(schema.viewEvents.galleryId, galleryId),
        eq(schema.viewEvents.kind, 'gallery_view'),
      ),
    )
    .get();
  if (firstView?.at) items.push({ at: firstView.at, kind: 'first_view' });

  const firstSelection = db
    .select({ at: sql<number>`min(${schema.selections.createdAt})` })
    .from(schema.selections)
    .innerJoin(schema.photos, eq(schema.selections.photoId, schema.photos.id))
    .where(eq(schema.photos.galleryId, galleryId))
    .get();
  if (firstSelection?.at) items.push({ at: firstSelection.at, kind: 'first_selection' });

  const events = db
    .select()
    .from(schema.galleryEvents)
    .where(eq(schema.galleryEvents.galleryId, galleryId))
    .all();
  for (const e of events) {
    items.push({
      at: e.createdAt,
      kind: e.type === 'note' ? 'note' : 'state_change',
      from: e.fromState,
      to: e.toState,
      note: e.note,
    });
  }

  return items.sort((a, b) => b.at - a.at);
}
