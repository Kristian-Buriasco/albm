import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: __dirname,
  serverExternalPackages: ['better-sqlite3', 'sharp'],
  // Include drizzle migration SQL files in the standalone bundle so
  // migrations can be applied at boot on the production host.
  outputFileTracingIncludes: {
    '/**': [path.join('drizzle', '**', '*')],
  },
  images: {
    // All images are served through our own auth-checked route handlers;
    // the Next image optimizer is not used.
    unoptimized: true,
  },
};

export default nextConfig;
