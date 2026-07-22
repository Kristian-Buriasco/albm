import { json, errorJson } from '@/lib/api';
import { ipFromRequest, writeAllowed } from '@/lib/rate-limit';
import { hashToken } from '@/lib/token-hash';
import { createInquiry, isEventType } from '@/lib/inquiries';
import { notifyNewInquiry } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

const WINDOW_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const ip = ipFromRequest(req);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorJson('Invalid request', 400);
  }

  // Honeypot: bots fill hidden fields; humans never do. Pretend success.
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return json({ ok: true });
  }

  // 5 submissions / 15 min / IP.
  if (!writeAllowed('contact', ip, 5, WINDOW_MS)) {
    return errorJson('Too many messages — please try again later.', 429);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!name || name.length > 120) return errorJson('Please enter your name.', 400);
  if (!EMAIL_RE.test(email)) return errorJson('Please enter a valid email.', 400);
  if (message.length < 2 || message.length > 4000)
    return errorJson('Please enter a message.', 400);

  const eventType = isEventType(body.eventType) ? body.eventType : null;
  let eventDate: number | null = null;
  if (typeof body.eventDate === 'string' && body.eventDate) {
    const t = Date.parse(body.eventDate + 'T00:00:00Z');
    if (Number.isFinite(t)) eventDate = t;
  }

  const inquiry = createInquiry({
    name,
    email,
    eventType,
    eventDate,
    message,
    ipHash: hashToken(ip),
  });

  // Fire-and-forget; sendMail never throws and no-ops without SMTP config.
  void notifyNewInquiry(inquiry);

  return json({ ok: true });
}
