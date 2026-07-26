import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/session';
import { getClientTags, listClients } from '@/lib/clients';
import AdminClientsClient from './AdminClientsClient';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage() {
  if (!(await isAdmin())) redirect('/admin/login');

  const clients = listClients();
  const tagsByClient: Record<string, { id: string; name: string }[]> = {};
  for (const c of clients) {
    tagsByClient[c.id] = getClientTags(c.id);
  }

  return <AdminClientsClient clients={clients} tagsByClient={tagsByClient} />;
}
