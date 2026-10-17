import { AuthError } from './errors.mjs';

const snippet = async (res) => (await res.text().catch(() => '')).slice(0, 200);

// Thin client for the Albm worker API. Relative image URLs from a job are joined onto --url.
export function createApi({ url, token }) {
  async function request(path, init = {}) {
    let res;
    try {
      res = await fetch(url + path, {
        ...init,
        headers: { authorization: `Bearer ${token}`, ...init.headers },
      });
    } catch (err) {
      throw new Error(`cannot reach ${url}: ${err.cause?.code ?? err.message}`);
    }
    if (res.status === 401) throw new AuthError('server rejected the worker token (401)');
    return res;
  }

  return {
    async fetchJobs({ task, limit, gallery, redo }) {
      const q = new URLSearchParams({ task, limit: String(limit) });
      if (gallery) q.set('gallery', gallery);
      if (redo) q.set('redo', '1');
      const res = await request(`/api/worker/jobs?${q}`);
      if (!res.ok) throw new Error(`jobs: HTTP ${res.status} ${await snippet(res)}`);
      return res.json();
    },

    async downloadImage(imageUrl) {
      if (!imageUrl?.startsWith('/')) throw new Error(`unexpected imageUrl: ${imageUrl}`);
      const res = await request(imageUrl);
      if (!res.ok) throw new Error(`image: HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },

    async postResults(body) {
      const res = await request('/api/worker/results', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`results: HTTP ${res.status} ${await snippet(res)}`);
      return res.json();
    },
  };
}
