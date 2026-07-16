import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  outputFileTracingRoot: __dirname,
  serverExternalPackages: [
    'better-sqlite3',
    'sharp',
    'tesseract.js',
    '@vladmandic/face-api',
    '@tensorflow/tfjs',
    '@tensorflow/tfjs-core',
    '@tensorflow/tfjs-backend-wasm',
  ],
  // Include drizzle migration SQL files in the standalone bundle so
  // migrations can be applied at boot on the production host.
  // Face-api model weights + tesseract worker assets for Phase 3 ML on the mini.
  outputFileTracingIncludes: {
    '/**': [
      path.join('drizzle', '**', '*'),
      path.join('node_modules', '@vladmandic', 'face-api', 'model', '**', '*'),
      path.join('node_modules', '@tensorflow', 'tfjs-backend-wasm', 'dist', '**', '*'),
      path.join('node_modules', 'tesseract.js', '**', '*'),
      path.join('node_modules', 'tesseract.js-core', '**', '*'),
    ],
  },
  images: {
    // All images are served through our own auth-checked route handlers;
    // the Next image optimizer is not used.
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
