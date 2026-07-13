export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Opens the DB (applying migrations) and re-enqueues photos stuck
    // in 'processing' from a previous run.
    const { recoverStuckJobs } = await import('@/lib/queue');
    recoverStuckJobs();
  }
}
