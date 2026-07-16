import { NextResponse } from 'next/server';
import { getPrincipal, isAdmin } from './session';
import { collaboratorHasCapability, type Capability } from './grants';

/** Owner-only gate. Alias kept as requireAdmin for the many existing callers. */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** Explicit owner-only gate (same as requireAdmin; clearer intent). */
export const requireOwner = requireAdmin;

/**
 * Gallery-scoped gate: owner always passes; a collaborator passes iff they hold
 * `cap` on this gallery. Non-grantees get 404 (no existence oracle). Returns a
 * Response to short-circuit, or the resolved principal marker to continue.
 */
export async function requireGalleryCapability(
  galleryId: string,
  cap: Capability,
): Promise<NextResponse | null> {
  const principal = await getPrincipal();
  if (!principal) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (principal.role === 'owner') return null;
  if (collaboratorHasCapability(galleryId, principal.collaboratorId, cap)) {
    return null;
  }
  // Hide existence from a collaborator with no grant on this gallery.
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorJson(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
