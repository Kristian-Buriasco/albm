import fs from 'node:fs';
import path from 'node:path';

/** Repo to check for releases; overridable so forks can point at their own. */
const UPDATE_REPO = process.env.UPDATE_REPO ?? 'Kristian-Buriasco/gallery-site';
const CACHE_MS = 24 * 60 * 60 * 1000;

let cachedCurrent: string | null = null;

/** The running app version — APP_VERSION (baked at build) or package.json. */
export function currentVersion(): string {
  if (cachedCurrent) return cachedCurrent;
  if (process.env.APP_VERSION) {
    cachedCurrent = process.env.APP_VERSION.replace(/^v/, '');
    return cachedCurrent;
  }
  for (const c of [
    path.join(process.cwd(), 'package.json'),
    path.join(__dirname, '..', '..', 'package.json'),
  ]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(c, 'utf8')) as { version?: string };
      if (pkg.version) {
        cachedCurrent = pkg.version;
        return cachedCurrent;
      }
    } catch {
      // try next candidate
    }
  }
  cachedCurrent = '0.0.0';
  return cachedCurrent;
}

type LatestCache = { at: number; latest: string | null };
const globalForVersion = globalThis as unknown as {
  __latestVersion?: LatestCache;
};

function parseSemver(v: string): [number, number, number] | null {
  const m = v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** a > b ? */
function isNewer(a: string, b: string): boolean {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return false;
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

async function fetchLatest(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string };
    return data.tag_name ? data.tag_name.replace(/^v/, '') : null;
  } catch {
    return null;
  }
}

export type VersionInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
};

/**
 * Current + latest release version, with updateAvailable. The GitHub call is
 * cached 24h; DISABLE_UPDATE_CHECK=1 skips the outbound request entirely
 * (the app's only external network call).
 */
export async function getVersionInfo(): Promise<VersionInfo> {
  const current = currentVersion();
  if (process.env.DISABLE_UPDATE_CHECK === '1') {
    return { current, latest: null, updateAvailable: false };
  }
  const cache = globalForVersion.__latestVersion;
  let latest: string | null;
  if (cache && Date.now() - cache.at < CACHE_MS) {
    latest = cache.latest;
  } else {
    latest = await fetchLatest();
    globalForVersion.__latestVersion = { at: Date.now(), latest };
  }
  return {
    current,
    latest,
    updateAvailable: latest ? isNewer(latest, current) : false,
  };
}
