import { SITE_NAME } from './env';
import { getSetting } from './settings';

/** Site / owner name: Settings > General, else NEXT_PUBLIC_SITE_NAME. */
export function siteName(): string {
  return getSetting('siteName')?.trim() || SITE_NAME;
}
