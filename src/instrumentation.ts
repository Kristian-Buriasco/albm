export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Fail fast before serving traffic if secrets are missing in production.
    const { sessionSecret } = await import('@/lib/env');
    sessionSecret();

    // Opens the DB (applying migrations) and re-enqueues photos stuck
    // in 'processing' from a previous run.
    const { recoverStuckJobs } = await import('@/lib/queue');
    recoverStuckJobs();

    const { pruneOldViewEvents } = await import('@/lib/views');
    pruneOldViewEvents();

    const { pruneOldDownloadEvents } = await import('@/lib/downloads');
    pruneOldDownloadEvents();
  }
}
