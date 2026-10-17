#!/usr/bin/env node
// Albm analysis worker: leases photos from an Albm server, runs local engines, posts results.
import { setTimeout as sleep } from 'node:timers/promises';
import { parseConfig, USAGE } from './lib/args.mjs';
import { createApi } from './lib/api.mjs';
import { loadEngines } from './lib/engines.mjs';
import { makeTempDir, writeTemp, removeFile, removeDir, safeName } from './lib/temp.mjs';
import { AuthError, FatalError, UsageError } from './lib/errors.mjs';

const POLL_MS = 30_000;
const BATCH = 20;
const MAX_ERR = 200;

async function main(argv, env) {
  let cfg, engines;
  try {
    cfg = parseConfig(argv, env);
    if (cfg.help) {
      console.log(USAGE);
      return 0;
    }
    engines = await loadEngines(cfg, env);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`error: ${err.message}\n\n${USAGE}`);
      return 2;
    }
    throw err;
  }

  const api = createApi(cfg);
  const tmp = await makeTempDir();
  const stats = { analysed: 0, errors: 0, applied: 0, seq: 0 };
  const started = Date.now();

  async function flush(task, engine, results) {
    if (cfg.dryRun) {
      console.log(`dry-run: would POST ${results.length} ${task} result(s) as ${engine.id} v${engine.version}:`);
      for (const r of results) console.log(JSON.stringify(r));
      return;
    }
    const res = await api.postResults({ task, engine: engine.id, version: engine.version, results });
    stats.applied += res.applied ?? 0;
    for (const s of res.skipped ?? []) console.log(`skipped ${s.photoId}: ${s.reason}`);
  }

  async function analyse(task, engine, job) {
    const label = `[${++stats.seq}] ${task} ${job.photoId}${job.filename ? ` ${job.filename}` : ''}`;
    let file;
    const t0 = Date.now();
    try {
      file = await writeTemp(tmp, `${safeName(job.photoId)}.webp`, await api.downloadImage(job.imageUrl));
      const out = await engine.run(file);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (task === 'bibs') {
        console.log(`${label} ok ${secs}s numbers=${out.bibs.map((b) => b.number).join(',') || '-'}`);
        stats.analysed++;
        return { photoId: job.photoId, bibs: out.bibs };
      }
      console.log(`${label} ok ${secs}s alt="${out.alt}"`);
      stats.analysed++;
      return { photoId: job.photoId, alt: out.alt };
    } catch (err) {
      if (err instanceof AuthError || err instanceof FatalError) throw err;
      const msg = String(err?.message ?? err).replace(/\s+/g, ' ').slice(0, MAX_ERR);
      console.log(`${label} error: ${msg}`);
      stats.errors++;
      return { photoId: job.photoId, error: msg };
    } finally {
      if (file) await removeFile(file);
    }
  }

  async function drain(task) {
    let total = 0;
    const engine = engines[task];
    for (;;) {
      const { jobs = [], remaining } = await api.fetchJobs({
        task,
        limit: cfg.limit,
        gallery: cfg.gallery,
        redo: cfg.redo,
        since: started,
        lease: !cfg.dryRun,
      });
      if (!jobs.length) return total;
      console.log(`${task}: leased ${jobs.length} photo(s), ${remaining ?? '?'} more eligible after this batch`);
      let pending = [];
      for (const job of jobs) {
        pending.push(await analyse(task, engine, job));
        if (pending.length >= BATCH) {
          await flush(task, engine, pending);
          pending = [];
        }
      }
      if (pending.length) await flush(task, engine, pending);
      total += jobs.length;
      if (cfg.dryRun) return total; // a peek returns the same photos again
    }
  }

  let code = 0;
  try {
    for (;;) {
      let processed = 0;
      try {
        for (const task of cfg.tasks) processed += await drain(task);
      } catch (err) {
        if (err instanceof AuthError || err instanceof FatalError || !cfg.loop) throw err;
        console.error(`warn: ${err.message}; retrying in ${POLL_MS / 1000} s`);
      }
      if (!cfg.loop || cfg.dryRun) break;
      if (processed === 0) await sleep(POLL_MS);
    }
  } catch (err) {
    console.error(`error: ${err.message}`);
    code = 1;
  } finally {
    await removeDir(tmp);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`done: analysed=${stats.analysed} errors=${stats.errors} seconds=${secs}`);
    if (cfg.dryRun) {
      console.log('dry-run: nothing was posted and nothing was leased on the server');
    }
  }
  return code;
}

process.exitCode = await main(process.argv.slice(2), process.env);
