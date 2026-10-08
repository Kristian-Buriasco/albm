import { NextResponse } from 'next/server';
import { getPrincipal, isAdmin, type Principal } from './session';
import { collaboratorHasCapability, type Capability } from './grants';

/** Audit-log actor fields derived from a principal (owner default for null). */
export function auditActor(
  principal: Principal | null,
): { actorType: 'owner' | 'collaborator'; actorId: string | null } {
  if (principal && principal.role === 'collaborator') {
    return { actorType: 'collaborator', actorId: principal.collaboratorId };
  }
  return { actorType: 'owner', actorId: null };
}

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

/**
 * True when the caller is the owner, or a collaborator holding any active
 * capability on this gallery. Used for read-only media access so a collaborator
 * can see the thumbnails of photos they are uploading to a draft gallery.
 */
export async function canAdminViewGallery(galleryId: string): Promise<boolean> {
  const principal = await getPrincipal();
  if (!principal) return false;
  if (principal.role === 'owner') return true;
  return (
    collaboratorHasCapability(galleryId, principal.collaboratorId, 'upload') ||
    collaboratorHasCapability(galleryId, principal.collaboratorId, 'organize')
  );
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorJson(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
