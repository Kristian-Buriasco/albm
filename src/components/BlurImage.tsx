'use client';

import { useCallback, useState } from 'react';

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

  // SSR'd <img> can finish loading before hydration, so onLoad never fires and
  // the image would stay opacity-0 forever: check `complete` on mount.
  const imgRef = useCallback((el: HTMLImageElement | null) => {
    if (el?.complete && el.naturalWidth > 0) setLoaded(true);
  }, []);

  // Transient failure (overloaded server, dropped connection): retry twice
  // with a cache-busting param instead of leaving a permanent blank.
  const onError = () => {
    if (attempt >= 2) return;
    setTimeout(() => setAttempt((a) => a + 1), 1000 * (attempt + 1));
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
