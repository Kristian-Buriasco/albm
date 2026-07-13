'use client';

import { useState } from 'react';
import Lightbox, { type LightboxPhoto } from './Lightbox';

export default function PortfolioGrid({ photos }: { photos: LightboxPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 [&>button]:mb-3">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(i)}
            className="block w-full cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/img/${p.id}/thumb`}
              alt={p.filename}
              loading="lazy"
              width={p.width}
              height={p.height}
              className="w-full"
            />
          </button>
        ))}
      </div>
      {open !== null && (
        <Lightbox
          photos={photos}
          index={open}
          onClose={() => setOpen(null)}
          onNavigate={setOpen}
        />
      )}
    </>
  );
}
