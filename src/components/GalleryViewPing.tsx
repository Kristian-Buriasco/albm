'use client';

import { useEffect } from 'react';
import { gaGalleryRef, trackEvent } from '@/lib/ga-events';

/**
 * Fires the `gallery_view` GA event once on mount. The server already
 * records the internal view (recordGalleryView); this just mirrors it to GA,
 * since GA needs a browser-side call.
 */
export default function GalleryViewPing({
  gallery,
}: {
  gallery: { id: string; type: 'client' | 'portfolio'; title: string };
}) {
  useEffect(() => {
    trackEvent('gallery_view', {
      gallery_ref: gaGalleryRef(gallery),
      gallery_type: gallery.type,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallery.id]);

  return null;
}
