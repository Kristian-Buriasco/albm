import fs from 'node:fs';
import { redirect } from 'next/navigation';
import { getGalleryDefaults } from '@/lib/gallery-defaults';
import { getSetting } from '@/lib/settings';
import { watermarkPath } from '@/lib/paths';
import { isAdmin } from '@/lib/session';
import SettingsTabs from './SettingsTabs';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  return (
    <SettingsTabs
      defaults={getGalleryDefaults()}
      settingsFormProps={{
        initialAbout: getSetting('aboutContent') ?? '',
        initialContact: getSetting('contactContent') ?? '',
        initialAnalyticsHeadHtml: getSetting('analytics_head_html') ?? '',
        initialHomeEyebrow: getSetting('homeEyebrow') ?? '',
        initialHomeHeadline: getSetting('homeHeadline') ?? '',
        initialHomeIntro: getSetting('homeIntro') ?? '',
        initialContactEmail: getSetting('contactEmail') ?? '',
        initialContactInstagram: getSetting('contactInstagram') ?? '',
        initialContactWhatsapp: getSetting('contactWhatsapp') ?? '',
        initialFooterContent: getSetting('footerContent') ?? '',
        initialDefaultLanguage: getSetting('defaultLanguage') ?? 'en',
        hasWatermark: fs.existsSync(watermarkPath()),
      }}
    />
  );
}
