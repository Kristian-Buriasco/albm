import { errorJson, json, requireAdmin } from '@/lib/api';
import { mailerConfigured, notifyRecipientEmail, sendMail } from '@/lib/mailer';

export const dynamic = 'force-dynamic';

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (!mailerConfigured()) {
    return errorJson('SMTP is not configured yet.', 400);
  }
  const to = notifyRecipientEmail();
  if (!to) {
    return errorJson('No recipient — set "Notify to" or a contact email.', 400);
  }

  const ok = await sendMail({
    to,
    subject: 'Albm SMTP test',
    text: 'This is a test email from Albm. If you received it, SMTP is working.',
  });
  if (!ok) return errorJson('Send failed — check host/port/credentials.', 502);
  return json({ ok: true, to });
}
