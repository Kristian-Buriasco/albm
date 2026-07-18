import fs from 'node:fs';
import path from 'node:path';
import { open, type Reader, type CityResponse } from 'maxmind';
import { DATA_DIR } from './env';

/**
 * Optional, self-hosted IP → coarse location. Reads a local MaxMind
 * GeoLite2-City database if present at `$DATA_DIR/GeoLite2-City.mmdb`; when
 * absent, every lookup returns null (feature degrades to "Unknown"). No IP is
 * ever sent to a third party, and only coarse strings are stored — never a raw IP.
 */
const globalForGeo = globalThis as unknown as {
  __geoReader?: Reader<CityResponse> | null;
  __geoTried?: boolean;
};

function dbPath(): string {
  return path.join(DATA_DIR, 'GeoLite2-City.mmdb');
}

export function geoAvailable(): boolean {
  return fs.existsSync(dbPath());
}

async function reader(): Promise<Reader<CityResponse> | null> {
  if (globalForGeo.__geoTried) return globalForGeo.__geoReader ?? null;
  globalForGeo.__geoTried = true;
  try {
    if (!geoAvailable()) {
      globalForGeo.__geoReader = null;
      return null;
    }
    globalForGeo.__geoReader = await open<CityResponse>(dbPath());
    return globalForGeo.__geoReader;
  } catch {
    globalForGeo.__geoReader = null;
    return null;
  }
}

export interface Geo {
  city: string | null;
  country: string | null; // ISO code, e.g. "IT"
  /** Human label, e.g. "Turin, IT" or "IT" or null. */
  label: string | null;
}

function isPrivate(ip: string): boolean {
  return (
    ip === 'unknown' ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('172.') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  );
}

export async function lookupGeo(ip: string | null | undefined): Promise<Geo> {
  const empty: Geo = { city: null, country: null, label: null };
  if (!ip || isPrivate(ip)) return empty;
  const r = await reader();
  if (!r) return empty;
  try {
    const res = r.get(ip);
    if (!res) return empty;
    const city = res.city?.names?.en ?? null;
    const country = res.country?.iso_code ?? res.registered_country?.iso_code ?? null;
    const label = city && country ? `${city}, ${country}` : (city ?? country ?? null);
    return { city, country, label };
  } catch {
    return empty;
  }
}

/** Coarse device label from a User-Agent, e.g. "Chrome on macOS". Not a fingerprint. */
export function deviceLabel(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : null;
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows'
    : /Linux/.test(ua) ? 'Linux'
    : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? null;
}

/** Normalize a Referer header to a coarse source label for view analytics. */
export function referrerSource(referer: string | null | undefined, baseHost: string): string | null {
  if (!referer) return null;
  try {
    const host = new URL(referer).host;
    if (!host || host === baseHost) return 'direct';
    return host;
  } catch {
    return null;
  }
}
