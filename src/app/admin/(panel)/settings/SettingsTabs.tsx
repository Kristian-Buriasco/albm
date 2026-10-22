'use client';

import Tabs from '@/components/Tabs';
import SecuritySettings from './SecuritySettings';
import AdminSessionsPanel from './AdminSessionsPanel';
import GalleryDefaultsForm from './GalleryDefaultsForm';
import UploadTokensPanel from './UploadTokensPanel';
import ApiTokensPanel from './ApiTokensPanel';
import WorkerTokensPanel from './WorkerTokensPanel';
import SettingsForm from './SettingsForm';
import EmailSettings from './EmailSettings';
import StorageSettings from './StorageSettings';
import type { GalleryDefaultsStore } from '@/lib/gallery-defaults';

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'email', label: 'Email' },
  { id: 'security', label: 'Security' },
  { id: 'defaults', label: 'Gallery defaults' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'storage', label: 'Storage' },
];

export default function SettingsTabs({
  defaults,
  settingsFormProps,
  emailProps,
  storageProps,
}: {
  defaults: GalleryDefaultsStore;
  settingsFormProps: React.ComponentProps<typeof SettingsForm>;
  emailProps: React.ComponentProps<typeof EmailSettings>;
  storageProps: React.ComponentProps<typeof StorageSettings>;
}) {
  return (
    <Tabs tabs={tabs}>
      {(active) => (
        <>
          <div hidden={active !== 'general'}>
            <SettingsForm {...settingsFormProps} />
          </div>
          <div hidden={active !== 'email'}>
            <EmailSettings {...emailProps} />
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
            <div className="mt-12">
              <WorkerTokensPanel />
            </div>
            <div className="mt-12">
              <ApiTokensPanel />
            </div>
          </div>
          <div hidden={active !== 'storage'} className="max-w-2xl">
            <StorageSettings {...storageProps} />
          </div>
        </>
      )}
    </Tabs>
  );
}
