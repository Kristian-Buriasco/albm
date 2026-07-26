const SLUG_MAX = 80;

/**
 * lowercase-with-hyphens normalization for a gallery URL slug. Returns ''
 * when nothing usable is left — callers decide what to do with that (fall
 * back to auto-generation at creation, reject with 400 when editing).
 */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-$/, '');
}
