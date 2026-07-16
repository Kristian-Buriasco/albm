import { getSetting, setSetting } from '@/lib/settings';
import { galleries } from '@/db/schema';

export type GalleryDefaultsConfig = Partial<
  Pick<
    typeof galleries.$inferInsert,
    | 'watermarkEnabled'
    | 'watermarkPosition'
    | 'watermarkOpacity'
    | 'watermarkScale'
    | 'downloadEnabled'
    | 'favoritesDownloadEnabled'
    | 'selectionExportEnabled'
    | 'trackDownloads'
    | 'showExif'
    | 'showLocation'
    | 'commentsMode'
    | 'clientInfoMode'
    | 'limitSelections'
    | 'selectionLimit'
    | 'autoExpire'
  >
> & {
  /** Days until expiry when autoExpire is true (not a gallery column). */
  defaultExpiryDays?: number;
};

export type GalleryDefaultsStore = {
  /** Shared defaults applied to all new galleries. */
  shared?: GalleryDefaultsConfig;
};

const BOOL_KEYS = [
  'watermarkEnabled',
  'downloadEnabled',
  'favoritesDownloadEnabled',
  'selectionExportEnabled',
  'trackDownloads',
  'showExif',
  'showLocation',
  'autoExpire',
  'limitSelections',
] as const;

const WM_POSITIONS = ['br', 'bl', 'tr', 'tl', 'center'] as const;
const COMMENTS_MODES = ['off', 'post', 'pre'] as const;
const CLIENT_INFO_MODES = ['off', 'optional', 'required'] as const;

function parseConfig(raw: unknown): GalleryDefaultsConfig {
  if (!raw || typeof raw !== 'object') return {};
  const src = raw as Record<string, unknown>;
  const out: GalleryDefaultsConfig = {};

  for (const key of BOOL_KEYS) {
    if (typeof src[key] === 'boolean') (out as Record<string, boolean>)[key] = src[key];
  }
  if (typeof src.watermarkOpacity === 'number') {
    out.watermarkOpacity = Math.min(100, Math.max(0, Math.round(src.watermarkOpacity)));
  }
  if (typeof src.watermarkScale === 'number') {
    out.watermarkScale = Math.min(100, Math.max(5, Math.round(src.watermarkScale)));
  }
  if (WM_POSITIONS.includes(src.watermarkPosition as (typeof WM_POSITIONS)[number])) {
    out.watermarkPosition = src.watermarkPosition as GalleryDefaultsConfig['watermarkPosition'];
  }
  if (COMMENTS_MODES.includes(src.commentsMode as (typeof COMMENTS_MODES)[number])) {
    out.commentsMode = src.commentsMode as GalleryDefaultsConfig['commentsMode'];
  }
  if (CLIENT_INFO_MODES.includes(src.clientInfoMode as (typeof CLIENT_INFO_MODES)[number])) {
    out.clientInfoMode = src.clientInfoMode as GalleryDefaultsConfig['clientInfoMode'];
  }
  if (typeof src.selectionLimit === 'number' && src.selectionLimit > 0) {
    out.selectionLimit = Math.round(src.selectionLimit);
  } else if (src.selectionLimit === null) {
    out.selectionLimit = undefined;
  }
  if (typeof src.defaultExpiryDays === 'number' && src.defaultExpiryDays > 0) {
    out.defaultExpiryDays = Math.min(3650, Math.round(src.defaultExpiryDays));
  }
  return out;
}

/** Parse and validate galleryDefaults JSON from settings storage. */
export function parseGalleryDefaults(raw: string | null): GalleryDefaultsStore {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const store: GalleryDefaultsStore = {};
    if (parsed.shared) store.shared = parseConfig(parsed.shared);
    // [decision] one shared set for v1 — ignore client/portfolio split if present
    return store;
  } catch {
    return {};
  }
}

export function getGalleryDefaults(): GalleryDefaultsStore {
  return parseGalleryDefaults(getSetting('galleryDefaults'));
}

export function saveGalleryDefaults(store: GalleryDefaultsStore): void {
  setSetting('galleryDefaults', JSON.stringify(store));
}

/** Merge stored defaults into a new gallery insert (explicit body values win). */
export function applyGalleryDefaults(
  gallery: typeof galleries.$inferInsert,
  type: 'client' | 'portfolio',
): void {
  void type; // shared defaults only for v1
  const defaults = getGalleryDefaults().shared;
  if (!defaults) return;

  const { defaultExpiryDays, ...fields } = defaults;
  Object.assign(gallery, fields);

  if (defaults.autoExpire && defaultExpiryDays && defaultExpiryDays > 0) {
    gallery.expiresAt = Date.now() + defaultExpiryDays * 24 * 60 * 60 * 1000;
  }
}
