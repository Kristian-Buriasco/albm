import { notFound, redirect } from 'next/navigation';
import { isAdmin } from '@/lib/session';
import { galleriesForClient, getClient, getClientTags } from '@/lib/clients';
import AdminClientDetail from './AdminClientDetail';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export default async function AdminClientDetailPage({ params }: Params) {
  if (!(await isAdmin())) redirect('/admin/login');
  const { id } = await params;

  const client = getClient(id);
  if (!client) notFound();

  return (
    <AdminClientDetail
      client={client}
      galleries={galleriesForClient(id)}
      initialTags={getClientTags(id)}
    />
  );
}
