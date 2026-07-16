import { and, eq, isNull } from 'drizzle-orm';
import { getDb, schema } from '@/db';

export type Capability = 'upload' | 'organize';

export function parseCapabilities(raw: string): Capability[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((c): c is Capability => c === 'upload' || c === 'organize');
  } catch {
    return [];
  }
}

/** Active collaborator grant for a gallery, or null. */
export function activeGrant(galleryId: string, collaboratorId: string) {
  return (
    getDb()
      .select()
      .from(schema.galleryGrants)
      .where(
        and(
          eq(schema.galleryGrants.galleryId, galleryId),
          eq(schema.galleryGrants.collaboratorId, collaboratorId),
          eq(schema.galleryGrants.kind, 'collaborator'),
          isNull(schema.galleryGrants.revokedAt),
        ),
      )
      .get() ?? null
  );
}

/** True when the collaborator holds `cap` on the gallery via an active grant. */
export function collaboratorHasCapability(
  galleryId: string,
  collaboratorId: string,
  cap: Capability,
): boolean {
  const grant = activeGrant(galleryId, collaboratorId);
  if (!grant) return false;
  // A disabled collaborator holds no capabilities.
  const collab = getDb()
    .select({ disabledAt: schema.collaborators.disabledAt })
    .from(schema.collaborators)
    .where(eq(schema.collaborators.id, collaboratorId))
    .get();
  if (!collab || collab.disabledAt) return false;
  return parseCapabilities(grant.capabilities).includes(cap);
}

/** Gallery ids a collaborator can access (any active grant, not disabled). */
export function collaboratorGalleryIds(collaboratorId: string): string[] {
  const collab = getDb()
    .select({ disabledAt: schema.collaborators.disabledAt })
    .from(schema.collaborators)
    .where(eq(schema.collaborators.id, collaboratorId))
    .get();
  if (!collab || collab.disabledAt) return [];
  return getDb()
    .select({ galleryId: schema.galleryGrants.galleryId })
    .from(schema.galleryGrants)
    .where(
      and(
        eq(schema.galleryGrants.collaboratorId, collaboratorId),
        eq(schema.galleryGrants.kind, 'collaborator'),
        isNull(schema.galleryGrants.revokedAt),
      ),
    )
    .all()
    .map((r) => r.galleryId);
}
