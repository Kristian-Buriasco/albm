import { getSetting } from '@/lib/settings';

/** Validates an http(s) URL; returns the normalised string or null. */
export function cleanMainSiteUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "Back to my website" link target, or null when disabled / not configured. */
export function getMainSite(): { url: string; label: string } | null {
  if (getSetting('mainSiteEnabled') !== 'true') return null;
  const url = cleanMainSiteUrl(getSetting('mainSiteUrl') ?? '');
  if (!url) return null;
  return { url, label: getSetting('mainSiteLabel')?.trim() || new URL(url).hostname.replace(/^www\./, '') };
}
