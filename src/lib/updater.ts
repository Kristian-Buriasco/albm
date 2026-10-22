/** Talks to the host-side updater (deploy/updater). Albm itself never touches Docker. */
export const updaterConfigured = () => !!(process.env.UPDATER_URL && process.env.UPDATER_TOKEN);

export type UpdaterStatus = { state: 'idle' | 'pulling' | 'restarting' | 'done' | 'failed' | 'unreachable'; target: string | null; message: string };

async function call(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${process.env.UPDATER_URL!.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.UPDATER_TOKEN}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
}

export async function updaterStatus(): Promise<UpdaterStatus> {
  try {
    const res = await call('/status');
    if (res.ok) return (await res.json()) as UpdaterStatus;
  } catch {}
  return { state: 'unreachable', target: null, message: 'The updater did not answer' };
}

/** Ask the updater to move to `version`. Returns an error string, or null when it started. */
export async function startUpdate(version: string): Promise<string | null> {
  try {
    const res = await call('/update', { method: 'POST', body: JSON.stringify({ version }) });
    if (res.status === 202) return null;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? `Updater refused (HTTP ${res.status})`;
  } catch {
    return 'The updater did not answer';
  }
}
