import { json, requireOwner } from '@/lib/api';
import { ipFromRequest } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Owner-only diagnostic: which client IP the app derives for THIS request, and
 * the raw proxy headers it saw. Rate limits are keyed on this address, so if it
 * is a proxy/private address instead of your own public IP, every visitor
 * shares one bucket — set TRUSTED_PROXY_HOPS or CLIENT_IP_HEADER.
 */
export async function GET(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const ip = ipFromRequest(req);
  const pick = (n: string) => req.headers.get(n);
  const looksPrivate =
    /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|unknown$)/i.test(ip);
  return json({
    detectedIp: ip,
    looksPrivateOrUnknown: looksPrivate,
    headers: {
      'x-forwarded-for': pick('x-forwarded-for'),
      'x-real-ip': pick('x-real-ip'),
      'cf-connecting-ip': pick('cf-connecting-ip'),
    },
    config: {
      CLIENT_IP_HEADER: process.env.CLIENT_IP_HEADER ?? null,
      TRUSTED_PROXY_HOPS: process.env.TRUSTED_PROXY_HOPS ?? null,
    },
  });
}
