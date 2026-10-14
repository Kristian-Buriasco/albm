'use client';

import { useCallback, useRef, useState } from 'react';

export default function BlurImage({
  src,
  srcSet,
  sizes,
  alt,
  width,
  height,
  placeholder,
  className,
  style,
}: {
  src: string;
  srcSet?: string;
  sizes?: string;
  alt: string;
  width?: number;
  height?: number;
  placeholder?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Transient failure (overloaded server, dropped connection): retry twice
  // with a cache-busting param instead of leaving a permanent blank.
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useCallback(() => {
    if (retryTimer.current) return;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      setAttempt((a) => (a < 2 ? a + 1 : a));
    }, 1000 * (attempt + 1));
  }, [attempt]);

  // SSR'd <img> can finish (or fail) before hydration, so onLoad/onError never
  // fire and the image would stay opacity-0 forever: check `complete` on mount.
  const imgRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el?.complete) return;
      if (el.naturalWidth > 0) setLoaded(true);
      else if (attempt < 2) retry();
    },
    [attempt, retry],
  );
  const onError = () => {
    if (attempt < 2) retry();
  };
  const bust = (u: string) =>
    attempt ? `${u}${u.includes('?') ? '&' : '?'}r=${attempt}` : u;
  const bustSet = srcSet
    ?.split(',')
    .map((c) => bust(c.trim().split(' ')[0]) + ' ' + c.trim().split(' ').slice(1).join(' '))
    .join(', ');

  return (
    <span
      className="relative block overflow-hidden bg-line/30 dark:bg-line-dark/30"
      style={{
        ...(width && height ? { aspectRatio: `${width} / ${height}` } : undefined),
        ...style,
      }}
    >
      {placeholder && !loaded && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={placeholder}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-lg"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={attempt}
        ref={imgRef}
        src={bust(src)}
        srcSet={bustSet}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={onError}
        className={`${className ?? ''} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      />
    </span>
  );
}
