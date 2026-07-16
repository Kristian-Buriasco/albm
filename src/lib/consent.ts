export const CONSENT_COOKIE = 'cookie_consent';
export const CONSENT_NECESSARY = 'necessary';
export const CONSENT_ANALYTICS = 'analytics';

export type ConsentChoice = typeof CONSENT_NECESSARY | typeof CONSENT_ANALYTICS;

export function parseConsent(value: string | undefined | null): ConsentChoice | null {
  if (value === CONSENT_ANALYTICS || value === CONSENT_NECESSARY) return value;
  return null;
}

export function hasAnalyticsConsent(value: string | undefined | null): boolean {
  return parseConsent(value) === CONSENT_ANALYTICS;
}
