import { nanoid } from 'nanoid';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import type { Inquiry } from '@/db/schema';

export type InquiryStatus = 'new' | 'read' | 'archived';

const EVENT_TYPES = ['wedding', 'event', 'portrait', 'commercial', 'other'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(v: unknown): v is EventType {
  return typeof v === 'string' && (EVENT_TYPES as readonly string[]).includes(v);
}

export type NewInquiry = {
  name: string;
  email: string;
  eventType?: string | null;
  eventDate?: number | null;
  message: string;
  ipHash?: string | null;
};

/** Insert a lead. Caller is responsible for validation + rate limiting. */
export function createInquiry(input: NewInquiry): Inquiry {
  const row = {
    id: nanoid(),
    name: input.name.slice(0, 120),
    email: input.email.slice(0, 200),
    eventType: input.eventType ?? null,
    eventDate: input.eventDate ?? null,
    message: input.message.slice(0, 4000),
    status: 'new' as const,
    ipHash: input.ipHash ?? null,
    createdAt: Date.now(),
  };
  getDb().insert(schema.inquiries).values(row).run();
  return row;
}

export function listInquiries(status?: InquiryStatus): Inquiry[] {
  const db = getDb();
  const base = db.select().from(schema.inquiries);
  const rows = status
    ? base.where(eq(schema.inquiries.status, status))
    : base;
  return rows.orderBy(desc(schema.inquiries.createdAt)).limit(500).all();
}

export function setInquiryStatus(id: string, status: InquiryStatus): void {
  getDb()
    .update(schema.inquiries)
    .set({ status })
    .where(eq(schema.inquiries.id, id))
    .run();
}

export function unreadInquiryCount(): number {
  const r = getDb()
    .select({ c: sql<number>`count(*)` })
    .from(schema.inquiries)
    .where(eq(schema.inquiries.status, 'new'))
    .get();
  return r?.c ?? 0;
}
