// Best-effort transactional email. Entirely optional: if SMTP_* env vars are
// not set, every send is a silent no-op so the rest of the app works unchanged
// (same graceful-degradation pattern as the optional geo database). No secrets
// live in the repo — SMTP credentials come from the launchd plist / env only.
//
// Enable by setting on the host:
//   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS,
//   SMTP_FROM (envelope from, e.g. "Albm <noreply@yourdomain>"),
//   SMTP_TO   (where notifications go; falls back to the contactEmail setting)

import { getSetting } from './settings';

type SmtpConfig = {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
};

/** Settings value first, then env var, else undefined. */
function cfg(settingKey: string, envKey: string): string | undefined {
  return getSetting(settingKey)?.trim() || process.env[envKey]?.trim() || undefined;
}

function smtpConfig(): SmtpConfig | null {
  const host = cfg('smtpHost', 'SMTP_HOST');
  if (!host) return null;
  const user = cfg('smtpUser', 'SMTP_USER');
  const from = cfg('smtpFrom', 'SMTP_FROM') || user;
  if (!from) return null;
  return {
    host,
    port: Number(getSetting('smtpPort') || process.env.SMTP_PORT) || 587,
    user,
    // Password is not trimmed (may legitimately contain spaces).
    pass: getSetting('smtpPass') || process.env.SMTP_PASS || undefined,
    from,
  };
}

/** True when SMTP is configured; useful for admin status display. */
export function mailerConfigured(): boolean {
  return smtpConfig() !== null;
}

/** Recipient for internal notifications. */
function notifyRecipient(): string | null {
  return (
    cfg('smtpTo', 'SMTP_TO') ||
    getSetting('contactEmail')?.trim() ||
    null
  );
}

/** Public: current notification recipient (for admin display / test send). */
export function notifyRecipientEmail(): string | null {
  return notifyRecipient();
}

/**
 * Send a plain-text email. Returns true on success, false if not configured or
 * on failure. Never throws — callers treat email as fire-and-forget.
 */
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const cfg = smtpConfig();
  if (!cfg) return false;
  try {
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
    await transport.sendMail({
      from: cfg.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      replyTo: opts.replyTo,
    });
    return true;
  } catch (err) {
    console.error('[mailer] send failed:', (err as Error).message);
    return false;
  }
}

/** Notify the photographer of a new contact inquiry. Fire-and-forget. */
export async function notifyNewInquiry(inq: {
  name: string;
  email: string;
  eventType?: string | null;
  eventDate?: number | null;
  message: string;
}): Promise<void> {
  const to = notifyRecipient();
  if (!to) return;
  const when = inq.eventDate
    ? new Date(inq.eventDate).toISOString().slice(0, 10)
    : '—';
  const text = [
    `New inquiry from ${inq.name} <${inq.email}>`,
    '',
    `Event type: ${inq.eventType || '—'}`,
    `Event date: ${when}`,
    '',
    inq.message,
  ].join('\n');
  await sendMail({
    to,
    subject: `New inquiry — ${inq.name}`,
    text,
    replyTo: inq.email,
  });
}
