import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/session';
import { auditActionTypes, listAuditLog } from '@/lib/audit-log';
import AdminAuditClient from './AdminAuditClient';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  if (!(await isAdmin())) redirect('/admin/login');

  const { action } = await searchParams;
  const filter = action?.trim() || null;
  const rows = listAuditLog({ action: filter });
  const actions = auditActionTypes();

  return (
    <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
      <AdminAuditClient rows={rows} actions={actions} filter={filter} />
    </Suspense>
  );
}
