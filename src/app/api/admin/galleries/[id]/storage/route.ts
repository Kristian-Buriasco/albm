import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api';
import { galleryStorageUsage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard) return guard;
  const { id } = await params;
  return NextResponse.json(galleryStorageUsage(id));
}
