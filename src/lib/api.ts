import { NextResponse } from 'next/server';
import { isAdmin } from './session';

export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdmin()) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorJson(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}
