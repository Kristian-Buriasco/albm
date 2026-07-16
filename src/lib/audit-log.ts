import { asc, desc, eq, lt, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';

const MAX_ROWS = 5000;
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const SUMMARY_MAX = 500;

export type AuditTarget = {
  targetType?: string | null;
  targetId?: string | null;
  summary: string;
};

/** Record a privileged admin action (no PII beyond the summary line). */
export function logAdmin(action: string, target: AuditTarget): void {
  getDb()
    .insert(schema.auditLog)
    .values({
      id: nanoid(),
      at: Date.now(),
      action,
      targetType: target.targetType ?? null,
      targetId: target.targetId ?? null,
      summary: target.summary.slice(0, SUMMARY_MAX),
    })
    .run();
  if (Math.random() < 0.05) pruneAuditLog();
}

/** Drop rows older than 1 year, then cap at MAX_ROWS. */
export function pruneAuditLog(): void {
  const db = getDb();
  const cutoff = Date.now() - MAX_AGE_MS;
  db.delete(schema.auditLog).where(lt(schema.auditLog.at, cutoff)).run();

  const count = db.select({ c: sql<number>`count(*)` }).from(schema.auditLog).get()?.c ?? 0;
  if (count <= MAX_ROWS) return;

  const excess = count - MAX_ROWS;
  const oldest = db
    .select({ id: schema.auditLog.id })
    .from(schema.auditLog)
    .orderBy(asc(schema.auditLog.at))
    .limit(excess)
    .all();
  for (const row of oldest) {
    db.delete(schema.auditLog).where(eq(schema.auditLog.id, row.id)).run();
  }
}

export function listAuditLog(opts: { action?: string | null; limit?: number } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const db = getDb();
  const q = db.select().from(schema.auditLog);
  if (opts.action) {
    return q
      .where(eq(schema.auditLog.action, opts.action))
      .orderBy(desc(schema.auditLog.at))
      .limit(limit)
      .all();
  }
  return q.orderBy(desc(schema.auditLog.at)).limit(limit).all();
}

export function auditActionTypes(): string[] {
  return getDb()
    .selectDistinct({ action: schema.auditLog.action })
    .from(schema.auditLog)
    .orderBy(asc(schema.auditLog.action))
    .all()
    .map((r) => r.action);
}
