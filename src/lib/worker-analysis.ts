import { and, asc, eq, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb, schema, type Db } from '@/db';
import { verifyWorkerToken, type WorkerTokenRow } from '@/lib/worker-tokens';

/** Analysis tasks a worker can lease and report. */
export const ANALYSIS_TASKS = ['alt', 'bibs', 'score'] as const;
export type AnalysisTask = (typeof ANALYSIS_TASKS)[number];

const LEASE_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_BATCH = 50;
const MAX_BIBS_PER_PHOTO = 12; // same cap as extractBibNumbers (bib-ocr.ts)
const MAX_ALT_CHARS = 300;
const MAX_ERROR_CHARS = 300;
const MAX_ENGINE_CHARS = 60;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Analysis = typeof schema.photoAnalysis.$inferInsert;

export type ResultItem = {
  photoId: string;
  alt?: string;
  bibs?: { number: string; confidence: number | null }[];
  score?: number;
  error?: string;
};
export type ResultsBody = { task: AnalysisTask; engine: string; version: number; results: ResultItem[] };
export type LeaseOptions = {
  task: AnalysisTask;
  limit: number;
  galleryId: string | null;
  minVersion: number;
  redo: boolean;
  /** redo only re-offers rows last touched before this time (ms epoch), so one --redo run visits each photo once. */
  since: number | null;
  /** false = peek (dry run): nothing is leased or changed. */
  lease: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isAnalysisTask(v: unknown): v is AnalysisTask {
  return v === 'alt' || v === 'bibs' || v === 'score';
}

/** Resolve the worker bearer token from the request; null = unauthorized. */
export function authorizeWorker(req: Request): WorkerTokenRow | null {
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return bearer ? verifyWorkerToken(bearer) : null;
}

/** Control characters become spaces, whitespace collapsed, trimmed, capped at `max` code points. */
function cleanText(s: string, max: number): string {
  const flat = s.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  return [...flat].slice(0, max).join('').trim();
}

/** Same rules as extractBibNumbers (bib-ocr.ts), plus confidence: strip zeros, drop "0", dedupe, keep the 12 most confident. */
export function normalizeBibs(
  input: Record<string, unknown>[],
): { number: string; confidence: number | null }[] {
  const best = new Map<string, number | null>();
  for (const { number, confidence } of input) {
    if (typeof number !== 'string' || !/^\d{1,6}$/.test(number)) continue;
    const n = number.replace(/^0+/, '');
    if (!n) continue;
    const c =
      typeof confidence === 'number' && Number.isFinite(confidence)
        ? Math.min(1, Math.max(0, confidence))
        : null;
    if (!best.has(n) || (c ?? -1) > (best.get(n) ?? -1)) best.set(n, c);
  }
  return [...best.entries()]
    .map(([number, confidence]) => ({ number, confidence }))
    .sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1))
    .slice(0, MAX_BIBS_PER_PHOTO);
}

/** Lease-state conditions shared by /jobs (where) and /status (counts). */
function eligibleConditions(task: AnalysisTask, galleryId: string | null) {
  return [
    eq(schema.photos.status, 'ready'),
    galleryId ? eq(schema.photos.galleryId, galleryId) : undefined,
    task === 'bibs' ? eq(schema.galleries.bibSearch, true) : undefined,
    task === 'alt'
      ? or(isNull(schema.photos.altSource), ne(schema.photos.altSource, 'human'))
      : undefined,
  ];
}

/** Validate GET /api/worker/jobs query params. */
export function parseJobsQuery(q: URLSearchParams): { value: LeaseOptions } | { error: string } {
  const task = q.get('task');
  if (!isAnalysisTask(task)) return { error: 'task must be alt, bibs or score' };
  const limit = q.get('limit') ?? '10';
  const minVersion = q.get('minVersion') ?? '1';
  const redo = q.get('redo') ?? '0';
  if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > MAX_BATCH) {
    return { error: `limit must be 1-${MAX_BATCH}` };
  }
  if (!/^\d+$/.test(minVersion) || Number(minVersion) < 1) {
    return { error: 'minVersion must be an integer >= 1' };
  }
  if (redo !== '0' && redo !== '1') return { error: 'redo must be 0 or 1' };
  const since = q.get('since');
  if (since !== null && !/^\d{1,15}$/.test(since)) return { error: 'since must be a ms timestamp' };
  const lease = q.get('lease') ?? '1';
  if (lease !== '0' && lease !== '1') return { error: 'lease must be 0 or 1' };
  return {
    value: {
      task,
      limit: Number(limit),
      galleryId: q.get('gallery') || null,
      minVersion: Number(minVersion),
      redo: redo === '1',
      since: since === null ? null : Number(since),
      lease: lease === '1',
    },
  };
}

/** Lease `limit` photos for a task in one transaction. */
export function leaseJobs(opts: LeaseOptions) {
  const pa = schema.photoAnalysis;
  const now = Date.now();
  const untouchedSince = opts.since === null ? undefined : lt(pa.updatedAt, opts.since);
  const doneOk = opts.redo
    ? and(eq(pa.status, 'done'), untouchedSince)
    : and(eq(pa.status, 'done'), lt(pa.version, opts.minVersion));
  const errorOk = opts.redo
    ? and(eq(pa.status, 'error'), untouchedSince)
    : and(eq(pa.status, 'error'), lt(pa.attempts, MAX_ATTEMPTS));
  // A lease that expired without a result counts as an attempt: stop offering it after MAX_ATTEMPTS.
  const expiredLease = and(
    eq(pa.status, 'leased'),
    lte(pa.leasedUntil, now),
    opts.redo ? untouchedSince : lt(pa.attempts, MAX_ATTEMPTS),
  );
  // Alt text that was cleared (for example a human edit removed) is worth generating again.
  const clearedAlt =
    opts.task === 'alt'
      ? and(eq(pa.status, 'done'), or(isNull(schema.photos.altText), eq(schema.photos.altText, '')))
      : undefined;
  const offerable = or(isNull(pa.photoId), eq(pa.status, 'pending'), doneOk, errorOk, expiredLease, clearedAlt);

  return getDb().transaction(
    (tx) => {
      const where = and(...eligibleConditions(opts.task, opts.galleryId), offerable);
      const candidates = tx
        .select({
          id: schema.photos.id,
          galleryId: schema.photos.galleryId,
          filename: schema.photos.filename,
          width: schema.photos.width,
          height: schema.photos.height,
        })
        .from(schema.photos)
        .innerJoin(schema.galleries, eq(schema.galleries.id, schema.photos.galleryId))
        .leftJoin(pa, and(eq(pa.photoId, schema.photos.id), eq(pa.task, opts.task)))
        .where(where)
        .orderBy(asc(schema.photos.createdAt))
        .limit(opts.limit)
        .all();

      for (const c of opts.lease ? candidates : []) {
        const lease: Analysis = {
          photoId: c.id,
          task: opts.task,
          status: 'leased',
          leasedUntil: now + LEASE_MS,
          attempts: 1,
          updatedAt: now,
        };
        tx.insert(pa)
          .values(lease)
          .onConflictDoUpdate({
            target: [pa.photoId, pa.task],
            set: {
              status: 'leased',
              leasedUntil: lease.leasedUntil,
              attempts: sql`${pa.attempts} + 1`,
              updatedAt: now,
            },
          })
          .run();
      }

      // Counted after the leases above, so leased photos are not "remaining" (a peek counts the unleased rest).
      const remaining =
        tx
          .select({ n: sql<number>`count(*)` })
          .from(schema.photos)
          .innerJoin(schema.galleries, eq(schema.galleries.id, schema.photos.galleryId))
          .leftJoin(pa, and(eq(pa.photoId, schema.photos.id), eq(pa.task, opts.task)))
          .where(where)
          .get()?.n ?? 0;

      return {
        jobs: candidates.map((c) => ({
          photoId: c.id,
          galleryId: c.galleryId,
          filename: c.filename,
          width: c.width,
          height: c.height,
          // Scoring runs a vision model per photo, so it gets the smaller derivative.
          imageUrl: `/api/worker/image/${c.id}?variant=${opts.task === 'score' ? 'md' : 'web'}`,
        })),
        remaining,
      };
    },
    { behavior: 'immediate' },
  );
}

/** Eligible photos per task, split by analysis state. Leases are only counted while active. */
export function taskStatus(task: AnalysisTask, galleryId: string | null) {
  const pa = schema.photoAnalysis;
  const now = Date.now();
  const row = getDb()
    .select({
      total: sql<number>`count(*)`,
      done: sql<number>`coalesce(sum(case when ${pa.status} = 'done' then 1 else 0 end), 0)`,
      leased: sql<number>`coalesce(sum(case when ${pa.status} = 'leased' and ${pa.leasedUntil} > ${now} then 1 else 0 end), 0)`,
      error: sql<number>`coalesce(sum(case when ${pa.status} = 'error' then 1 else 0 end), 0)`,
    })
    .from(schema.photos)
    .innerJoin(schema.galleries, eq(schema.galleries.id, schema.photos.galleryId))
    .leftJoin(pa, and(eq(pa.photoId, schema.photos.id), eq(pa.task, task)))
    .where(and(...eligibleConditions(task, galleryId)))
    .get();
  const counts = row ?? { total: 0, done: 0, leased: 0, error: 0 };
  return {
    done: counts.done,
    pending: counts.total - counts.done - counts.leased - counts.error,
    leased: counts.leased,
    error: counts.error,
  };
}

/** Validate the whole POST /api/worker/results body. Field-level bib/alt junk is dropped, not fatal. */
export function parseResultsBody(body: unknown): { value: ResultsBody } | { error: string } {
  if (!isRecord(body)) return { error: 'Body must be a JSON object' };
  const { task, engine, version, results } = body;
  if (!isAnalysisTask(task)) return { error: 'task must be alt, bibs or score' };
  if (typeof engine !== 'string' || !engine.trim() || engine.trim().length > MAX_ENGINE_CHARS) {
    return { error: `engine must be a 1-${MAX_ENGINE_CHARS} character string` };
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { error: 'version must be an integer >= 1' };
  }
  if (!Array.isArray(results) || results.length < 1 || results.length > MAX_BATCH) {
    return { error: `results must be an array of 1-${MAX_BATCH} items` };
  }
  const items: ResultItem[] = [];
  for (const [i, raw] of results.entries()) {
    const item = parseResultItem(task, raw);
    if (typeof item === 'string') return { error: `results[${i}]: ${item}` };
    items.push(item);
  }
  return { value: { task, engine: engine.trim(), version, results: items } };
}

function parseResultItem(task: AnalysisTask, raw: unknown): ResultItem | string {
  if (!isRecord(raw)) return 'must be an object';
  const { photoId, alt, bibs, score, error } = raw;
  if (typeof photoId !== 'string' || !photoId || photoId.length > 64) {
    return 'photoId must be a non-empty string';
  }
  if (error != null) {
    if (typeof error !== 'string') return 'error must be a string';
    return { photoId, error };
  }
  if (task === 'alt') {
    if (typeof alt !== 'string') return 'alt must be a string (or error)';
    return { photoId, alt };
  }
  if (task === 'score') {
    if (typeof score !== 'number' || !Number.isFinite(score)) return 'score must be a number (or error)';
    return { photoId, score: Math.min(10, Math.max(1, score)) };
  }
  if (!Array.isArray(bibs)) return 'bibs must be an array (or error)';
  return { photoId, bibs: normalizeBibs(bibs.filter(isRecord)) };
}

function saveAnalysis(tx: Tx, values: Analysis) {
  const pa = schema.photoAnalysis;
  tx.insert(pa)
    .values(values)
    .onConflictDoUpdate({ target: [pa.photoId, pa.task], set: values })
    .run();
}

/** Apply every result in one transaction. Human-written alt text is never overwritten. */
export function applyResults(body: ResultsBody): {
  applied: number;
  skipped: { photoId: string; reason: string }[];
} {
  const now = Date.now();
  return getDb().transaction((tx) => {
    let applied = 0;
    const skipped: { photoId: string; reason: string }[] = [];
    for (const item of body.results) {
      const photo = tx
        .select()
        .from(schema.photos)
        .where(eq(schema.photos.id, item.photoId))
        .get();
      if (!photo) {
        skipped.push({ photoId: item.photoId, reason: 'not-found' });
        continue;
      }
      const base = {
        photoId: photo.id,
        task: body.task,
        engine: body.engine,
        version: body.version,
        leasedUntil: null,
        updatedAt: now,
      };
      if (item.error !== undefined) {
        saveAnalysis(tx, { ...base, status: 'error', error: cleanText(item.error, MAX_ERROR_CHARS) });
        applied++;
        continue;
      }
      if (body.task === 'alt') {
        if (photo.altSource === 'human') {
          saveAnalysis(tx, { ...base, status: 'done', error: null });
          skipped.push({ photoId: photo.id, reason: 'human-edited' });
          continue;
        }
        const alt = cleanText(item.alt ?? '', MAX_ALT_CHARS);
        if (!alt) {
          saveAnalysis(tx, { ...base, status: 'error', error: 'empty alt text' });
          skipped.push({ photoId: photo.id, reason: 'empty-alt' });
          continue;
        }
        tx.update(schema.photos)
          .set({ altText: alt, altSource: 'ai', updatedAt: now })
          .where(eq(schema.photos.id, photo.id))
          .run();
      } else if (body.task === 'score') {
        // updatedAt is the image cache-buster, so it stays untouched.
        tx.update(schema.photos).set({ aiScore: item.score ?? null }).where(eq(schema.photos.id, photo.id)).run();
      } else {
        tx.delete(schema.photoBibs).where(eq(schema.photoBibs.photoId, photo.id)).run();
        for (const b of item.bibs ?? []) {
          tx.insert(schema.photoBibs)
            .values({
              id: nanoid(),
              photoId: photo.id,
              galleryId: photo.galleryId,
              number: b.number,
              confidence: b.confidence,
              engine: body.engine,
              createdAt: now,
            })
            .run();
        }
      }
      saveAnalysis(tx, { ...base, status: 'done', error: null });
      applied++;
    }
    return { applied, skipped };
  });
}
