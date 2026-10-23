import { UsageError } from './errors.mjs';

// Returns { bibs?: engine, alt?: engine } where engine = { id, version, run(imagePath) }.
export async function loadEngines(cfg, env) {
  const engines = {};
  if (env.WORKER_FAKE_ENGINES === '1') {
    const fake = await import('../engines/fake.mjs');
    for (const task of cfg.tasks) engines[task] = fake.createFakeEngine(task, env);
    return engines;
  }
  try {
    if (cfg.tasks.includes('bibs')) {
      if (process.platform !== 'darwin') throw new UsageError('bibs needs macOS (Apple Vision); run --tasks alt elsewhere');
      const m = await import('../engines/bibs-apple-vision.mjs');
      engines.bibs = m.createEngine(env);
    }
    if (cfg.tasks.includes('score')) engines.score = (await import('../engines/score-ollama.mjs')).createEngine(env);
    if (cfg.tasks.includes('alt')) {
      const provider = env.ALT_ENGINE || 'ollama';
      if (provider === 'ollama') {
        engines.alt = (await import('../engines/alt-ollama.mjs')).createEngine(env);
      } else if (provider === 'anthropic') {
        if (!cfg.allowCloud) {
          throw new UsageError('the anthropic alt engine sends photos to a third party: pass --allow-cloud or set ALT_ALLOW_CLOUD=1');
        }
        if (!env.ANTHROPIC_API_KEY) throw new UsageError('ANTHROPIC_API_KEY is not set');
        engines.alt = (await import('../engines/alt-anthropic.mjs')).createEngine(env);
      } else {
        throw new UsageError(`unknown ALT_ENGINE "${provider}" (ollama or anthropic)`);
      }
    }
  } catch (err) {
    if (err instanceof UsageError) throw err;
    throw new UsageError(err.message);
  }
  return engines;
}
