import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema } from '@/db';

const MAX_ROWS = 5000;
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const SUMMARY_MAX = 500;

export type AuditTarget = {
  targetType?: string | null;
  targetId?: string | null;
  summary: string;
  /** Who performed the action. Defaults to 'owner' for existing callers. */
  actorType?: 'owner' | 'collaborator';
  /** collaborators.id when actorType='collaborator'. */
  actorId?: string | null;
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
      actorType: target.actorType ?? 'owner',
      actorId: target.actorType === 'collaborator' ? (target.actorId ?? null) : null,
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

export type AuditFilter = {
  action?: string | null;
  actorType?: 'owner' | 'collaborator' | null;
  since?: number | null; // epoch ms lower bound
  limit?: number;
};

function auditConditions(opts: AuditFilter) {
  const conds = [];
  if (opts.action) conds.push(eq(schema.auditLog.action, opts.action));
  if (opts.actorType) conds.push(eq(schema.auditLog.actorType, opts.actorType));
  if (opts.since) conds.push(gte(schema.auditLog.at, opts.since));
  return conds;
}

export function listAuditLog(opts: AuditFilter = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
  const db = getDb();
  const conds = auditConditions(opts);
  const q = db.select().from(schema.auditLog);
  return (conds.length ? q.where(and(...conds)) : q)
    .orderBy(desc(schema.auditLog.at))
    .limit(limit)
    .all();
}

/** Full filtered result (capped) formatted as CSV for export. */
export function exportAuditCsv(opts: AuditFilter = {}): string {
  const db = getDb();
  const conds = auditConditions(opts);
  const q = db.select().from(schema.auditLog);
  const rows = (conds.length ? q.where(and(...conds)) : q)
    .orderBy(desc(schema.auditLog.at))
    .limit(5000)
    .all();
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = 'timestamp,action,actor_type,actor_id,target_type,target_id,summary';
  const lines = rows.map((r) =>
    [
      new Date(r.at).toISOString(),
      r.action,
      r.actorType,
      r.actorId ?? '',
      r.targetType ?? '',
      r.targetId ?? '',
      r.summary,
    ]
      .map(esc)
      .join(','),
  );
  return [header, ...lines].join('\n');
}

export function auditActionTypes(): string[] {
  return getDb()
    .selectDistinct({ action: schema.auditLog.action })
    .from(schema.auditLog)
    .orderBy(asc(schema.auditLog.action))
    .all()
    .map((r) => r.action);
}
