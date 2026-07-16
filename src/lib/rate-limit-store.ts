import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb, schema } from '@/db';

/** Count hits for a key within the sliding window. Prunes expired rows for this key. */
export function hitCount(key: string, windowMs: number): number {
  const now = Date.now();
  const cutoff = now - windowMs;
  const db = getDb();
  db.delete(schema.rateLimitHits)
    .where(and(eq(schema.rateLimitHits.key, key), sql`${schema.rateLimitHits.at} < ${cutoff}`))
    .run();
  return (
    db
      .select({ c: sql<number>`count(*)` })
      .from(schema.rateLimitHits)
      .where(and(eq(schema.rateLimitHits.key, key), gte(schema.rateLimitHits.at, cutoff)))
      .get()?.c ?? 0
  );
}

/** Record one hit at the current time. */
export function recordHit(key: string, windowMs: number): void {
  const now = Date.now();
  const cutoff = now - windowMs;
  const db = getDb();
  db.delete(schema.rateLimitHits)
    .where(and(eq(schema.rateLimitHits.key, key), sql`${schema.rateLimitHits.at} < ${cutoff}`))
    .run();
  db.insert(schema.rateLimitHits).values({ key, at: now }).run();
}

/** Remove all hits for a key (e.g. after successful auth). */
export function clearHits(key: string): void {
  getDb().delete(schema.rateLimitHits).where(eq(schema.rateLimitHits.key, key)).run();
}
