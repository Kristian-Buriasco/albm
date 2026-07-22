import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/session';
import { listInquiries, type InquiryStatus } from '@/lib/inquiries';
import { mailerConfigured } from '@/lib/mailer';
import AdminInquiriesClient from './AdminInquiriesClient';

export const dynamic = 'force-dynamic';

const FILTERS: InquiryStatus[] = ['new', 'read', 'archived'];

export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!(await isAdmin())) redirect('/admin/login');

  const { status } = await searchParams;
  const filter = (FILTERS as string[]).includes(status ?? '')
    ? (status as InquiryStatus)
    : undefined;
  const rows = listInquiries(filter);

  return (
    <AdminInquiriesClient
      rows={rows}
      filter={filter ?? null}
      emailEnabled={mailerConfigured()}
    />
  );
}
