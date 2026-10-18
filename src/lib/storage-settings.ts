import crypto from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import { sessionSecret } from './env';
import { getSetting, setSetting } from './settings';
import {
  envObjectStoreConfig,
  setStorageOverride,
  type ObjectStoreConfig,
  type StorageOverride,
} from './object-store';

/**
 * Object storage settings saved from Settings > Storage. They live in the `settings` table as one
 * JSON value; the secret key is AES-256-GCM encrypted with a key derived from SESSION_SECRET, so a
 * copied DB file alone does not reveal it. Once saved, they replace the S3_* env vars entirely.
 * shortcut: rotating SESSION_SECRET makes the stored secret unreadable, so re-enter it then.
 */

const KEY = 'storage.s3';

export interface StoredStorage {
  enabled: boolean;
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretEnc: string;
  prefix: string;
  keepLocal: boolean;
  originals: boolean;
  /** Empty = every gallery. */
  galleries: string[];
}

export interface StorageForm {
  enabled: boolean;
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  /** Blank keeps the current secret (saved or env). */
  secretAccessKey?: string;
  prefix: string;
  keepLocal: boolean;
  originals: boolean;
  galleries: string[];
}

function encKey(): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', sessionSecret(), '', 'albm-storage-settings', 32));
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptSecret(enc: string): string | null {
  try {
    const [v, iv, tag, ct] = enc.split('.');
    if (v !== 'v1' || !iv || !tag || !ct) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'base64url'), { authTagLength: 16 });
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// Read on every request of the hot /img path, so keep a short in-memory copy; saves invalidate it.
const g = globalThis as unknown as {
  __storageStored?: { at: number; value: StoredStorage | null; override: StorageOverride | null };
  __storageWarned?: boolean;
};
const TTL_MS = 5000;

function load(): { value: StoredStorage | null; override: StorageOverride | null } {
  const c = g.__storageStored;
  if (c && Date.now() - c.at < TTL_MS) return c;
  let value: StoredStorage | null = null;
  try {
    const raw = getSetting(KEY);
    if (raw) {
      try {
        value = JSON.parse(raw) as StoredStorage;
        if (!value || typeof value !== 'object' || !Array.isArray(value.galleries)) throw new Error('malformed');
      } catch {
        console.error('[storage-settings] saved storage settings are corrupt; using environment settings');
        value = null;
      }
    }
  } catch (err) {
    // DB busy or unreadable: keep serving the last known good value instead of flipping to env.
    if (c) {
      g.__storageStored = { ...c, at: Date.now() };
      return c;
    }
    throw err;
  }
  const entry = { at: Date.now(), value, override: value ? toOverride(value) : null };
  g.__storageStored = entry;
  return entry;
}

export function readStored(): StoredStorage | null {
  return load().value;
}

function toOverride(s: StoredStorage): StorageOverride | null {
  const secret = s.enabled ? decryptSecret(s.secretEnc) : null;
  if (s.enabled && !secret) {
    // Saved but unreadable (SESSION_SECRET changed): fall back to env rather than silently turning storage off.
    if (!g.__storageWarned) {
      g.__storageWarned = true;
      console.error('[storage-settings] saved storage secret cannot be decrypted (SESSION_SECRET changed?); using environment settings. Re-enter it in Settings > Storage.');
    }
    return null;
  }
  let config: ObjectStoreConfig | null = null;
  if (s.enabled && secret && s.endpoint && s.bucket && s.accessKeyId) {
    config = {
      endpoint: s.endpoint,
      bucket: s.bucket,
      region: s.region || 'auto',
      accessKeyId: s.accessKeyId,
      secretAccessKey: secret,
      prefix: s.prefix,
      keepLocal: s.keepLocal,
    };
  }
  return { config, galleries: s.galleries, originals: s.originals };
}

/** Wire the saved settings into object-store.ts. Called from instrumentation at boot. */
export function registerStorageSettings(): void {
  setStorageOverride(() => load().override);
}

function normPrefix(p: string): string {
  const x = p.trim().replace(/^\/+/, '');
  return x && !x.endsWith('/') ? `${x}/` : x;
}

/** Validate and normalise the form; returns an error string or the clean value. */
export function validateForm(f: StorageForm): string | StorageForm {
  const endpoint = String(f.endpoint ?? '').trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return 'Endpoint must be a full URL, e.g. https://<account>.r2.cloudflarestorage.com';
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return 'Endpoint must use https';
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return 'Endpoint must be the bare host, without a path';
  const bucket = String(f.bucket ?? '').trim();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return 'Bucket name looks invalid (3-63 lowercase letters, digits, - and .)';
  const region = String(f.region ?? '').trim() || 'auto';
  if (!/^[\w-]{1,32}$/.test(region)) return 'Region looks invalid';
  const accessKeyId = String(f.accessKeyId ?? '').trim();
  if (!accessKeyId || accessKeyId.length > 200) return 'Access key ID required';
  const prefix = normPrefix(String(f.prefix ?? ''));
  if (prefix && (!/^[\w\-./]{1,100}$/.test(prefix) || prefix.split('/').slice(0, -1).some((x) => !x || x === '.' || x === '..'))) {
    return 'Key prefix may only contain letters, digits, - _ . and /, without empty or .. parts';
  }
  const galleries = Array.isArray(f.galleries) ? f.galleries.map(String) : [];
  if (galleries.length > 500 || galleries.some((id) => !/^[\w-]{1,64}$/.test(id))) return 'Invalid gallery list';
  const secret = typeof f.secretAccessKey === 'string' ? f.secretAccessKey.trim() : '';
  if (secret.length > 300) return 'Secret key too long';
  return {
    enabled: !!f.enabled,
    endpoint,
    bucket,
    region,
    accessKeyId,
    secretAccessKey: secret,
    prefix,
    keepLocal: !!f.keepLocal,
    originals: !!f.originals,
    galleries: [...new Set(galleries)],
  };
}

/** The secret a blank form field falls back to: the saved one, else the env one. */
export function currentSecret(): string {
  const s = readStored();
  if (s) return decryptSecret(s.secretEnc) ?? '';
  return process.env.S3_SECRET_ACCESS_KEY ?? '';
}

export function saveStorage(f: StorageForm): void {
  const secret = f.secretAccessKey || currentSecret();
  if (f.enabled && !secret) throw new Error('Secret access key required');
  const stored: StoredStorage = {
    enabled: f.enabled,
    endpoint: f.endpoint,
    bucket: f.bucket,
    region: f.region,
    accessKeyId: f.accessKeyId,
    secretEnc: secret ? encryptSecret(secret) : '',
    prefix: f.prefix,
    keepLocal: f.keepLocal,
    originals: f.originals,
    galleries: f.galleries,
  };
  setSetting(KEY, JSON.stringify(stored));
  g.__storageStored = undefined;
  g.__storageWarned = false;
}

/** Remove the saved settings so the S3_* env vars apply again. */
export function clearStorage(): void {
  setSetting(KEY, '');
  g.__storageStored = undefined;
}

export interface StorageView {
  source: 'ui' | 'env' | 'none';
  enabled: boolean;
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  hasSecret: boolean;
  /** Saved secret exists but cannot be decrypted (SESSION_SECRET changed). */
  secretUnreadable: boolean;
  prefix: string;
  keepLocal: boolean;
  originals: boolean;
  galleries: string[];
}

/** What the form shows. Never includes the secret. */
export function storageView(): StorageView {
  const s = readStored();
  if (s) {
    const secret = s.secretEnc ? decryptSecret(s.secretEnc) : null;
    return {
      source: 'ui',
      enabled: s.enabled,
      endpoint: s.endpoint,
      bucket: s.bucket,
      region: s.region,
      accessKeyId: s.accessKeyId,
      hasSecret: !!secret,
      secretUnreadable: !!s.secretEnc && !secret,
      prefix: s.prefix,
      keepLocal: s.keepLocal,
      originals: s.originals,
      galleries: s.galleries,
    };
  }
  const env = envObjectStoreConfig();
  const only = (process.env.S3_GALLERIES ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return {
    source: env ? 'env' : 'none',
    enabled: !!env,
    endpoint: env?.endpoint ?? process.env.S3_ENDPOINT ?? '',
    bucket: env?.bucket ?? process.env.S3_BUCKET ?? '',
    region: env?.region ?? (process.env.S3_REGION || 'auto'),
    accessKeyId: env?.accessKeyId ?? process.env.S3_ACCESS_KEY_ID ?? '',
    hasSecret: !!process.env.S3_SECRET_ACCESS_KEY,
    secretUnreadable: false,
    prefix: env?.prefix ?? '',
    keepLocal: env?.keepLocal ?? true,
    originals: ['1', 'true', 'yes'].includes((process.env.S3_ORIGINALS ?? '').toLowerCase()),
    galleries: only,
  };
}

/** Put, get and delete a tiny object to prove the credentials, bucket and endpoint work. */
export async function testConnection(f: StorageForm): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = f.secretAccessKey || currentSecret();
  if (!secret) return { ok: false, error: 'Secret access key required' };
  const c = new AwsClient({ accessKeyId: f.accessKeyId, secretAccessKey: secret, service: 's3', region: f.region, retries: 0 });
  const key = `${f.prefix}_albm-test/${crypto.randomBytes(8).toString('hex')}.txt`;
  const url = `${f.endpoint}/${f.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const body = 'albm storage test';
  const step = async (label: string, init: RequestInit, expect: (r: Response) => boolean) => {
    const signed = await c.sign(url, init);
    const res = await fetch(signed.url, { method: signed.method, headers: signed.headers, body: init.body as BodyInit | undefined, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!expect(res)) {
      const hint = res.status === 403 ? ' (check the key and its permissions on this bucket)' : res.status === 404 ? ' (bucket not found)' : '';
      throw new Error(`${label} failed: HTTP ${res.status}${hint}`);
    }
    return res;
  };
  try {
    await step('Write', { method: 'PUT', body }, (r) => r.ok);
    const got = await step('Read', { method: 'GET' }, (r) => r.ok);
    if ((await got.text()).slice(0, 100) !== body) throw new Error('Read returned different data');
    await step('Delete', { method: 'DELETE' }, (r) => r.ok || r.status === 404);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: /^(Write|Read|Delete) failed|^Read returned/.test(msg) ? msg : 'Could not reach the endpoint' };
  }
}
