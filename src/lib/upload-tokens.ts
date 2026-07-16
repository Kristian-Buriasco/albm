import { asc, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import { constantTimeEqual, generateBearerToken, hashToken } from '@/lib/token-hash';

export type UploadTokenRow = typeof schema.uploadTokens.$inferSelect;

export function listUploadTokens(): UploadTokenRow[] {
  return getDb()
    .select()
    .from(schema.uploadTokens)
    .orderBy(asc(schema.uploadTokens.createdAt))
    .all();
}

/** Create token; returns raw token once (never stored). */
export function createUploadToken(name: string): { row: UploadTokenRow; rawToken: string } {
  const rawToken = generateBearerToken();
  const row: typeof schema.uploadTokens.$inferInsert = {
    id: nanoid(),
    name: name.trim().slice(0, 120),
    tokenHash: hashToken(rawToken),
  };
  getDb().insert(schema.uploadTokens).values(row).run();
  const saved = getDb()
    .select()
    .from(schema.uploadTokens)
    .where(eq(schema.uploadTokens.id, row.id))
    .get()!;
  return { row: saved, rawToken };
}

export function revokeUploadToken(id: string): boolean {
  const db = getDb();
  const row = db.select().from(schema.uploadTokens).where(eq(schema.uploadTokens.id, id)).get();
  if (!row || row.revokedAt) return false;
  db.update(schema.uploadTokens)
    .set({ revokedAt: Date.now() })
    .where(eq(schema.uploadTokens.id, id))
    .run();
  return true;
}

/** Resolve active token by bearer value; updates lastUsedAt on success. */
export function verifyUploadToken(
  bearer: string,
): typeof schema.uploadTokens.$inferSelect | null {
  const tokenHash = hashToken(bearer);
  const rows = getDb()
    .select()
    .from(schema.uploadTokens)
    .where(isNull(schema.uploadTokens.revokedAt))
    .all();

  for (const row of rows) {
    if (constantTimeEqual(row.tokenHash, tokenHash)) {
      getDb()
        .update(schema.uploadTokens)
        .set({ lastUsedAt: Date.now() })
        .where(eq(schema.uploadTokens.id, row.id))
        .run();
      return row;
    }
  }
  return null;
}
