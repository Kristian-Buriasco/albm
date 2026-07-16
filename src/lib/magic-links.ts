import { and, eq, gt, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import { constantTimeEqual, generateBearerToken, hashToken } from '@/lib/token-hash';

const LINK_TTL_MS = 15 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 254);
}

export function findOrCreateAccount(email: string): typeof schema.clientAccounts.$inferSelect {
  const normalized = normalizeEmail(email);
  const db = getDb();
  const existing = db
    .select()
    .from(schema.clientAccounts)
    .where(eq(schema.clientAccounts.email, normalized))
    .get();
  if (existing) return existing;

  const row = { id: nanoid(), email: normalized };
  db.insert(schema.clientAccounts).values(row).run();
  return db.select().from(schema.clientAccounts).where(eq(schema.clientAccounts.id, row.id)).get()!;
}

/** Issue a single-use magic link; returns raw token once (never logged). */
export function issueMagicLink(
  accountId: string,
  galleryId: string,
): { linkId: string; rawToken: string; expiresAt: number } {
  const rawToken = generateBearerToken();
  const expiresAt = Date.now() + LINK_TTL_MS;
  const id = nanoid();
  getDb()
    .insert(schema.magicLinks)
    .values({
      id,
      accountId,
      galleryId,
      tokenHash: hashToken(rawToken),
      expiresAt,
    })
    .run();
  return { linkId: id, rawToken, expiresAt };
}

export type MagicLinkVerifyResult =
  | { ok: true; accountId: string; galleryId: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/** Verify and consume a magic link token. */
export function verifyMagicLink(rawToken: string, galleryId: string): MagicLinkVerifyResult {
  const tokenHash = hashToken(rawToken);
  const now = Date.now();
  const rows = getDb()
    .select()
    .from(schema.magicLinks)
    .where(
      and(
        eq(schema.magicLinks.galleryId, galleryId),
        isNull(schema.magicLinks.usedAt),
        gt(schema.magicLinks.expiresAt, now),
      ),
    )
    .all();

  for (const row of rows) {
    if (constantTimeEqual(row.tokenHash, tokenHash)) {
      getDb()
        .update(schema.magicLinks)
        .set({ usedAt: now })
        .where(eq(schema.magicLinks.id, row.id))
        .run();
      getDb()
        .update(schema.clientAccounts)
        .set({ lastLoginAt: now })
        .where(eq(schema.clientAccounts.id, row.accountId))
        .run();
      return { ok: true, accountId: row.accountId, galleryId: row.galleryId };
    }
  }

  const anyMatch = getDb()
    .select()
    .from(schema.magicLinks)
    .where(eq(schema.magicLinks.galleryId, galleryId))
    .all()
    .some((r) => constantTimeEqual(r.tokenHash, tokenHash));

  if (anyMatch) return { ok: false, reason: 'used' };
  return { ok: false, reason: 'invalid' };
}

/** Merge selections from anonymous visitor into account-linked visitor. */
export function mergeVisitorSelections(
  fromVisitorId: string,
  toVisitorId: string,
  galleryId: string,
): void {
  const db = getDb();
  const fromSelections = db
    .select()
    .from(schema.selections)
    .where(eq(schema.selections.visitorId, fromVisitorId))
    .all();

  for (const sel of fromSelections) {
    db.insert(schema.selections)
      .values({
        photoId: sel.photoId,
        visitorId: toVisitorId,
        listId: sel.listId,
        createdAt: sel.createdAt,
      })
      .onConflictDoNothing()
      .run();
  }

  const fromLists = db
    .select()
    .from(schema.selectionLists)
    .where(
      and(
        eq(schema.selectionLists.visitorId, fromVisitorId),
        eq(schema.selectionLists.galleryId, galleryId),
      ),
    )
    .all();

  for (const list of fromLists) {
    const exists = db
      .select()
      .from(schema.selectionLists)
      .where(
        and(
          eq(schema.selectionLists.visitorId, toVisitorId),
          eq(schema.selectionLists.galleryId, galleryId),
          eq(schema.selectionLists.name, list.name),
        ),
      )
      .get();
    if (!exists) {
      db.insert(schema.selectionLists)
        .values({
          id: nanoid(),
          galleryId,
          visitorId: toVisitorId,
          name: list.name,
          createdAt: list.createdAt,
        })
        .run();
    }
  }
}

export function getAccountEmail(accountId: string): string | null {
  return (
    getDb()
      .select({ email: schema.clientAccounts.email })
      .from(schema.clientAccounts)
      .where(eq(schema.clientAccounts.id, accountId))
      .get()?.email ?? null
  );
}

/** Link current visitor session to account after magic link verification. */
export async function linkVisitorToAccount(
  galleryId: string,
  accountId: string,
  sessionToken: string,
  saveSession: (token: string) => Promise<void>,
): Promise<void> {
  const db = getDb();
  const email = getAccountEmail(accountId);

  let visitor = db
    .select()
    .from(schema.visitors)
    .where(
      and(
        eq(schema.visitors.galleryId, galleryId),
        eq(schema.visitors.accountId, accountId),
      ),
    )
    .get();

  if (!visitor && email) {
    visitor = db
      .select()
      .from(schema.visitors)
      .where(and(eq(schema.visitors.galleryId, galleryId), eq(schema.visitors.email, email)))
      .get();
  }

  const current = db
    .select()
    .from(schema.visitors)
    .where(eq(schema.visitors.sessionToken, sessionToken))
    .get();

  if (!visitor && email) {
    if (current && current.galleryId === galleryId) {
      db.update(schema.visitors)
        .set({ accountId, email, updatedAt: Date.now() })
        .where(eq(schema.visitors.id, current.id))
        .run();
      visitor = db.select().from(schema.visitors).where(eq(schema.visitors.id, current.id)).get()!;
    } else {
      const row = {
        id: nanoid(),
        galleryId,
        accountId,
        email,
        name: null,
        sessionToken,
      };
      db.insert(schema.visitors).values(row).run();
      visitor = row as typeof schema.visitors.$inferSelect;
    }
  } else if (visitor) {
    db.update(schema.visitors)
      .set({ accountId, email: email ?? visitor.email, updatedAt: Date.now() })
      .where(eq(schema.visitors.id, visitor.id))
      .run();
    if (current && current.id !== visitor.id && current.galleryId === galleryId) {
      mergeVisitorSelections(current.id, visitor.id, galleryId);
    }
  }

  await saveSession(visitor!.sessionToken);
}
