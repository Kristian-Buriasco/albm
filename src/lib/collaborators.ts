import crypto from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import type { Capability } from '@/lib/grants';

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 320);
}

export function getCollaborator(id: string) {
  return (
    getDb().select().from(schema.collaborators).where(eq(schema.collaborators.id, id)).get() ??
    null
  );
}

export function markCollaboratorLogin(id: string): void {
  getDb()
    .update(schema.collaborators)
    .set({ lastLoginAt: Date.now() })
    .where(eq(schema.collaborators.id, id))
    .run();
}

function findOrCreateCollaborator(email: string, name: string | null): string {
  const db = getDb();
  const existing = db
    .select()
    .from(schema.collaborators)
    .where(eq(schema.collaborators.email, email))
    .get();
  if (existing) return existing.id;
  const id = nanoid();
  db.insert(schema.collaborators)
    .values({ id, email, name: name ?? null })
    .run();
  return id;
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
  } catch {
    return false;
  }
}

const DEFAULT_CAPS: Capability[] = ['upload', 'organize'];

/**
 * Invite (or re-invite) a collaborator to a gallery: upserts the collaborator,
 * ensures an active grant, and mints a single-use onboarding token (returned
 * raw once). Existing grant capabilities are preserved on re-invite.
 */
export function inviteCollaborator(opts: {
  galleryId: string;
  email: string;
  name?: string | null;
  capabilities?: Capability[];
  createdBy?: string | null;
}): { collaboratorId: string; rawToken: string; expiresAt: number } {
  const db = getDb();
  const email = normalizeEmail(opts.email);
  const collaboratorId = findOrCreateCollaborator(email, opts.name ?? null);

  const existingGrant = db
    .select()
    .from(schema.galleryGrants)
    .where(
      and(
        eq(schema.galleryGrants.galleryId, opts.galleryId),
        eq(schema.galleryGrants.collaboratorId, collaboratorId),
        eq(schema.galleryGrants.kind, 'collaborator'),
        isNull(schema.galleryGrants.revokedAt),
      ),
    )
    .get();
  if (!existingGrant) {
    db.insert(schema.galleryGrants)
      .values({
        id: nanoid(),
        galleryId: opts.galleryId,
        kind: 'collaborator',
        collaboratorId,
        capabilities: JSON.stringify(opts.capabilities ?? DEFAULT_CAPS),
        createdBy: opts.createdBy ?? null,
      })
      .run();
  }

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + INVITE_TTL_MS;
  db.insert(schema.collaboratorInvites)
    .values({
      id: nanoid(),
      collaboratorId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    })
    .run();
  return { collaboratorId, rawToken, expiresAt };
}

/** Verify an onboarding token (single-use, unexpired). Returns collaboratorId. */
export function consumeInvite(rawToken: string): { collaboratorId: string } | null {
  const db = getDb();
  const tokenHash = hashToken(rawToken);
  const rows = db
    .select()
    .from(schema.collaboratorInvites)
    .where(isNull(schema.collaboratorInvites.usedAt))
    .all();
  const now = Date.now();
  for (const row of rows) {
    if (constantTimeEqual(row.tokenHash, tokenHash)) {
      if (row.expiresAt < now) return null;
      db.update(schema.collaboratorInvites)
        .set({ usedAt: now })
        .where(eq(schema.collaboratorInvites.id, row.id))
        .run();
      return { collaboratorId: row.collaboratorId };
    }
  }
  return null;
}

/** Grants on a gallery with collaborator info, for the owner's panel. */
export function listGalleryCollaborators(galleryId: string) {
  return getDb()
    .select({
      grantId: schema.galleryGrants.id,
      collaboratorId: schema.collaborators.id,
      email: schema.collaborators.email,
      name: schema.collaborators.name,
      capabilities: schema.galleryGrants.capabilities,
      lastLoginAt: schema.collaborators.lastLoginAt,
      disabledAt: schema.collaborators.disabledAt,
      createdAt: schema.galleryGrants.createdAt,
    })
    .from(schema.galleryGrants)
    .innerJoin(
      schema.collaborators,
      eq(schema.galleryGrants.collaboratorId, schema.collaborators.id),
    )
    .where(
      and(
        eq(schema.galleryGrants.galleryId, galleryId),
        eq(schema.galleryGrants.kind, 'collaborator'),
        isNull(schema.galleryGrants.revokedAt),
      ),
    )
    .orderBy(desc(schema.galleryGrants.createdAt))
    .all();
}

export function revokeGrant(grantId: string): boolean {
  const db = getDb();
  const row = db
    .select()
    .from(schema.galleryGrants)
    .where(eq(schema.galleryGrants.id, grantId))
    .get();
  if (!row || row.revokedAt) return false;
  db.update(schema.galleryGrants)
    .set({ revokedAt: Date.now() })
    .where(eq(schema.galleryGrants.id, grantId))
    .run();
  return true;
}

export function setDisabled(collaboratorId: string, disabled: boolean): void {
  getDb()
    .update(schema.collaborators)
    .set({ disabledAt: disabled ? Date.now() : null })
    .where(eq(schema.collaborators.id, collaboratorId))
    .run();
}
