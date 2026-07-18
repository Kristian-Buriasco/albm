import crypto from 'node:crypto';
import { and, desc, eq, isNull, ne, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import { logAdmin } from './audit-log';

/** Auto-expire a session after this much inactivity (in addition to the 7-day cookie cap). */
export const SESSION_IDLE_MS = 48 * 60 * 60 * 1000;

function hashCoarse(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function createAdminSession(meta: {
  userAgent?: string | null;
  ip?: string | null;
  device?: string | null;
  location?: string | null;
  collaboratorId?: string | null;
}): string {
  const id = nanoid();
  const now = Date.now();
  const db = getDb();
  const ipHash = meta.ip ? hashCoarse(meta.ip) : null;
  const collaboratorId = meta.collaboratorId ?? null;

  // New-device/location detection: has this principal signed in from this
  // location or IP before? (checks all rows, including revoked)
  let seenBefore = false;
  if (ipHash || meta.location) {
    const conds = [
      collaboratorId
        ? eq(schema.adminSessions.collaboratorId, collaboratorId)
        : isNull(schema.adminSessions.collaboratorId),
    ];
    const match = or(
      ...(ipHash ? [eq(schema.adminSessions.ipHash, ipHash)] : []),
      ...(meta.location ? [eq(schema.adminSessions.location, meta.location)] : []),
    );
    if (match) conds.push(match);
    seenBefore = !!db
      .select({ id: schema.adminSessions.id })
      .from(schema.adminSessions)
      .where(and(...conds))
      .get();
  }

  db.insert(schema.adminSessions)
    .values({
      id,
      createdAt: now,
      lastSeenAt: now,
      userAgentHash: meta.userAgent ? hashCoarse(meta.userAgent) : null,
      ipHash,
      device: meta.device ?? null,
      location: meta.location ?? null,
      collaboratorId,
    })
    .run();

  const who = collaboratorId ? 'Collaborator' : 'Owner';
  const where = meta.location ?? 'unknown location';
  const dev = meta.device ?? 'unknown device';
  logAdmin(seenBefore ? 'admin.login' : 'admin.login.new', {
    summary: `${who} signed in — ${dev} · ${where}${seenBefore ? '' : ' (new device/location)'}`,
    actorType: collaboratorId ? 'collaborator' : 'owner',
    actorId: collaboratorId,
  });
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
  // Idle timeout: auto-revoke a session untouched for longer than the window.
  if (Date.now() - row.lastSeenAt > SESSION_IDLE_MS) {
    db.update(schema.adminSessions)
      .set({ revokedAt: Date.now() })
      .where(eq(schema.adminSessions.id, id))
      .run();
    return null;
  }
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
  device: string | null;
  location: string | null;
  collaboratorId: string | null;
};

export function listActiveAdminSessions(): AdminSessionRow[] {
  return getDb()
    .select({
      id: schema.adminSessions.id,
      createdAt: schema.adminSessions.createdAt,
      lastSeenAt: schema.adminSessions.lastSeenAt,
      userAgentHash: schema.adminSessions.userAgentHash,
      ipHash: schema.adminSessions.ipHash,
      device: schema.adminSessions.device,
      location: schema.adminSessions.location,
      collaboratorId: schema.adminSessions.collaboratorId,
    })
    .from(schema.adminSessions)
    .where(isNull(schema.adminSessions.revokedAt))
    .orderBy(desc(schema.adminSessions.lastSeenAt))
    .all();
}

