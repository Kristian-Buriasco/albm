import { asc, eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';
import { constantTimeEqual, generateBearerToken, hashToken } from '@/lib/token-hash';

export type WorkerTokenRow = typeof schema.workerTokens.$inferSelect;

export function listWorkerTokens(): WorkerTokenRow[] {
  return getDb()
    .select()
    .from(schema.workerTokens)
    .orderBy(asc(schema.workerTokens.createdAt))
    .all();
}

/** Create token; returns raw token once (never stored). */
export function createWorkerToken(name: string): { row: WorkerTokenRow; rawToken: string } {
  const rawToken = generateBearerToken();
  const row: typeof schema.workerTokens.$inferInsert = {
    id: nanoid(),
    name: name.trim().slice(0, 120),
    tokenHash: hashToken(rawToken),
  };
  getDb().insert(schema.workerTokens).values(row).run();
  const saved = getDb()
    .select()
    .from(schema.workerTokens)
    .where(eq(schema.workerTokens.id, row.id))
    .get()!;
  return { row: saved, rawToken };
}

export function revokeWorkerToken(id: string): boolean {
  const db = getDb();
  const row = db.select().from(schema.workerTokens).where(eq(schema.workerTokens.id, id)).get();
  if (!row || row.revokedAt) return false;
  db.update(schema.workerTokens)
    .set({ revokedAt: Date.now() })
    .where(eq(schema.workerTokens.id, id))
    .run();
  return true;
}

/** Resolve active worker token by bearer value; updates lastUsedAt on success. */
export function verifyWorkerToken(bearer: string): WorkerTokenRow | null {
  const tokenHash = hashToken(bearer);
  const rows = getDb()
    .select()
    .from(schema.workerTokens)
    .where(isNull(schema.workerTokens.revokedAt))
    .all();

  for (const row of rows) {
    if (constantTimeEqual(row.tokenHash, tokenHash)) {
      getDb()
        .update(schema.workerTokens)
        .set({ lastUsedAt: Date.now() })
        .where(eq(schema.workerTokens.id, row.id))
        .run();
      return row;
    }
  }
  return null;
}
