import crypto from 'node:crypto';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';

function hashCoarse(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function createAdminSession(meta: {
  userAgent?: string | null;
  ip?: string | null;
  collaboratorId?: string | null;
}): string {
  const id = nanoid();
  const now = Date.now();
  getDb()
    .insert(schema.adminSessions)
    .values({
      id,
      createdAt: now,
      lastSeenAt: now,
      userAgentHash: meta.userAgent ? hashCoarse(meta.userAgent) : null,
      ipHash: meta.ip ? hashCoarse(meta.ip) : null,
      collaboratorId: meta.collaboratorId ?? null,
    })
    .run();
  return id;
}

/**
 * Validate an active session id. Returns the authoritative principal from the
 * DB row (collaboratorId null = owner), or null if the session is
 * missing/revoked. Bumps lastSeenAt as a side effect.
 */
export function touchAdminSession(
  id: string,
): { collaboratorId: string | null } | null {
  const db = getDb();
  const row = db
    .select()
    .from(schema.adminSessions)
    .where(and(eq(schema.adminSessions.id, id), isNull(schema.adminSessions.revokedAt)))
    .get();
  if (!row) return null;
  db.update(schema.adminSessions)
    .set({ lastSeenAt: Date.now() })
    .where(eq(schema.adminSessions.id, id))
    .run();
  return { collaboratorId: row.collaboratorId ?? null };
}

export function revokeAdminSession(id: string): boolean {
  const db = getDb();
  const row = db.select().from(schema.adminSessions).where(eq(schema.adminSessions.id, id)).get();
  if (!row || row.revokedAt) return false;
  db.update(schema.adminSessions)
    .set({ revokedAt: Date.now() })
    .where(eq(schema.adminSessions.id, id))
    .run();
  return true;
}

export function revokeOtherAdminSessions(currentId: string): number {
  const db = getDb();
  const now = Date.now();
  const rows = db
    .select({ id: schema.adminSessions.id })
    .from(schema.adminSessions)
    .where(
      and(isNull(schema.adminSessions.revokedAt), ne(schema.adminSessions.id, currentId)),
    )
    .all();
  for (const row of rows) {
    db.update(schema.adminSessions)
      .set({ revokedAt: now })
      .where(eq(schema.adminSessions.id, row.id))
      .run();
  }
  return rows.length;
}

export type AdminSessionRow = {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  userAgentHash: string | null;
  ipHash: string | null;
};

export function listActiveAdminSessions(): AdminSessionRow[] {
  return getDb()
    .select({
      id: schema.adminSessions.id,
      createdAt: schema.adminSessions.createdAt,
      lastSeenAt: schema.adminSessions.lastSeenAt,
      userAgentHash: schema.adminSessions.userAgentHash,
      ipHash: schema.adminSessions.ipHash,
    })
    .from(schema.adminSessions)
    .where(isNull(schema.adminSessions.revokedAt))
    .orderBy(desc(schema.adminSessions.lastSeenAt))
    .all();
}
