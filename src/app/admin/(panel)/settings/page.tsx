import fs from 'node:fs';
import { getSetting } from '@/lib/settings';
import { watermarkPath } from '@/lib/paths';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';

export default function AdminSettingsPage() {
  return (
    <SettingsForm
      initialAbout={getSetting('aboutContent') ?? ''}
      initialContact={getSetting('contactContent') ?? ''}
      hasWatermark={fs.existsSync(watermarkPath())}
    />
  );
}
