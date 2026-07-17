'use client';

import Tabs from '@/components/Tabs';
import SecuritySettings from './SecuritySettings';
import AdminSessionsPanel from './AdminSessionsPanel';
import GalleryDefaultsForm from './GalleryDefaultsForm';
import UploadTokensPanel from './UploadTokensPanel';
import SettingsForm from './SettingsForm';
import type { GalleryDefaultsStore } from '@/lib/gallery-defaults';

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'security', label: 'Security' },
  { id: 'defaults', label: 'Gallery defaults' },
  { id: 'sharing', label: 'Sharing' },
];

export default function SettingsTabs({
  defaults,
  settingsFormProps,
}: {
  defaults: GalleryDefaultsStore;
  settingsFormProps: React.ComponentProps<typeof SettingsForm>;
}) {
  return (
    <Tabs tabs={tabs}>
      {(active) => (
        <>
          <div hidden={active !== 'general'}>
            <SettingsForm {...settingsFormProps} />
          </div>
          <div hidden={active !== 'security'} className="max-w-2xl space-y-12">
            <SecuritySettings />
            <AdminSessionsPanel />
          </div>
          <div hidden={active !== 'defaults'} className="max-w-2xl">
            <GalleryDefaultsForm initialDefaults={defaults} />
          </div>
          <div hidden={active !== 'sharing'} className="max-w-2xl">
            <UploadTokensPanel />
          </div>
        </>
      )}
    </Tabs>
  );
}
