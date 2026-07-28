'use client';

import { useState } from 'react';

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

  return (
    <span
      className="relative block overflow-hidden"
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
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`${className ?? ''} ${loaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
      />
    </span>
  );
}
