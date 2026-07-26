import { CONSENT_COOKIE, hasAnalyticsConsent } from '@/lib/consent';

/**
 * Privacy-safe gallery identifier for GA event params. Portfolio galleries
 * are already public/named publicly (title is already in <title>/OG tags) —
 * no new exposure. Client galleries send the opaque id only, never the
 * title/slug/linked-client name.
 */
export function gaGalleryRef(gallery: { id: string; type: 'client' | 'portfolio'; title: string }): string {
  return gallery.type === 'portfolio' ? gallery.title : gallery.id;
}

function readConsentCookieClientSide(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    __gaCustomEventsEnabled?: boolean;
  }
}

/**
 * Fires a GA4 custom event. No-ops unless gtag is loaded, the owner has
 * explicitly turned custom events on (Settings), AND the visitor has given
 * real cookie consent — checked directly here (not just left to Consent
 * Mode's internal denial) so nothing tracking-related ever fires pre-consent.
 */
export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined') return;
  if (!window.gtag) return;
  if (!window.__gaCustomEventsEnabled) return;
  if (!hasAnalyticsConsent(readConsentCookieClientSide())) return;
  window.gtag('event', name, params);
}
