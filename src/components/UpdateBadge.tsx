'use client';

import { useEffect, useState } from 'react';

type VersionInfo = {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
};

export default function UpdateBadge() {
  const [info, setInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setInfo(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!info?.updateAvailable) return null;

  return (
    <a
      href={`https://github.com/Kristian-Buriasco/gallery-site/releases/tag/v${info.latest}`}
      target="_blank"
      rel="noreferrer"
      title={`You're on v${info.current}. v${info.latest} is available.`}
      className="rounded-full border border-amber-500 px-2 py-0.5 text-[10px] tracking-wide text-amber-600 transition-colors hover:bg-amber-500 hover:text-white dark:text-amber-400"
    >
      v{info.latest} available
    </a>
  );
}
