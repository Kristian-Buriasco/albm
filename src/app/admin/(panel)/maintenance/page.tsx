import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/session';
import { volumeUsage, formatBytes } from '@/lib/storage';
import AdminMaintenanceClient from './AdminMaintenanceClient';

export const dynamic = 'force-dynamic';

export default async function AdminMaintenancePage() {
  if (!(await isAdmin())) redirect('/admin/login');

  const volume = volumeUsage();

  return (
    <AdminMaintenanceClient
      initialVolume={{
        totalBytes: volume.totalBytes,
        usedBytes: volume.usedBytes,
        freeBytes: volume.freeBytes,
      }}
      formattedTotal={formatBytes(volume.totalBytes)}
      formattedUsed={formatBytes(volume.usedBytes)}
      formattedFree={formatBytes(volume.freeBytes)}
    />
  );
}
