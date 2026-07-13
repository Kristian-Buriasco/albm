import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');

export const SESSION_SECRET =
  process.env.SESSION_SECRET ??
  // Dev-only fallback so the app boots without a .env; never rely on this in production.
  'insecure-dev-session-secret-change-me-0123456789abcdef';

export const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH ?? '';

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3200';

export const SITE_NAME =
  process.env.NEXT_PUBLIC_SITE_NAME ?? 'Kristian Buriasco';
