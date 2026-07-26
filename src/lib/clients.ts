import { and, asc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import type { Client } from '@/db/schema';

const NAME_MAX = 200;
const EMAIL_MAX = 320;
const PHONE_MAX = 40;
const NOTES_MAX = 5000;

export type ClientInput = {
  name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
};

export function listClients(): Client[] {
  return getDb().select().from(schema.clients).orderBy(asc(schema.clients.name)).all();
}

export function getClient(id: string): Client | undefined {
  return getDb().select().from(schema.clients).where(eq(schema.clients.id, id)).get();
}

export function createClient(input: ClientInput): Client | null {
  const name = input.name.trim().slice(0, NAME_MAX);
  const email = input.email.trim().slice(0, EMAIL_MAX);
  if (!name || !email) return null;

  const row = {
    id: nanoid(),
    name,
    email,
    phone: input.phone?.trim().slice(0, PHONE_MAX) || null,
    notes: input.notes?.trim().slice(0, NOTES_MAX) || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  getDb().insert(schema.clients).values(row).run();
  return row;
}

export function updateClient(id: string, input: Partial<ClientInput>): Client | null {
  const updates: Partial<typeof schema.clients.$inferInsert> = { updatedAt: Date.now() };
  if (typeof input.name === 'string') {
    const name = input.name.trim().slice(0, NAME_MAX);
    if (!name) return null;
    updates.name = name;
  }
  if (typeof input.email === 'string') {
    const email = input.email.trim().slice(0, EMAIL_MAX);
    if (!email) return null;
    updates.email = email;
  }
  if ('phone' in input) updates.phone = input.phone?.trim().slice(0, PHONE_MAX) || null;
  if ('notes' in input) updates.notes = input.notes?.trim().slice(0, NOTES_MAX) || null;

  getDb().update(schema.clients).set(updates).where(eq(schema.clients.id, id)).run();
  return getClient(id) ?? null;
}

export function deleteClient(id: string): void {
  getDb().delete(schema.clients).where(eq(schema.clients.id, id)).run();
}

export function galleriesForClient(id: string) {
  return getDb()
    .select({
      id: schema.galleries.id,
      title: schema.galleries.title,
      type: schema.galleries.type,
      deliveryState: schema.galleries.deliveryState,
    })
    .from(schema.galleries)
    .where(eq(schema.galleries.clientId, id))
    .all();
}

export function getClientTags(clientId: string): { id: string; name: string }[] {
  return getDb()
    .select({ id: schema.tags.id, name: schema.tags.name })
    .from(schema.clientTags)
    .innerJoin(schema.tags, eq(schema.clientTags.tagId, schema.tags.id))
    .where(eq(schema.clientTags.clientId, clientId))
    .orderBy(asc(schema.tags.name))
    .all();
}

export function assignTagToClient(clientId: string, tagId: string): void {
  getDb()
    .insert(schema.clientTags)
    .values({ clientId, tagId })
    .onConflictDoNothing()
    .run();
}

export function unassignTagFromClient(clientId: string, tagId: string): void {
  getDb()
    .delete(schema.clientTags)
    .where(and(eq(schema.clientTags.clientId, clientId), eq(schema.clientTags.tagId, tagId)))
    .run();
}
