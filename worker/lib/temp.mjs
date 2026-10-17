import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const makeTempDir = () => mkdtemp(join(tmpdir(), 'albm-worker-'));
export const writeTemp = async (dir, name, buf) => {
  const path = join(dir, name);
  await writeFile(path, buf);
  return path;
};
export const removeFile = (path) => rm(path, { force: true });
export const removeDir = (dir) => rm(dir, { recursive: true, force: true });
// Photo ids are opaque strings from the server: keep them safe as file names.
export const safeName = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
