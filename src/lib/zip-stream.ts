import { PassThrough, Readable } from 'node:stream';
import archiver from 'archiver';

export type ZipEntry = {
  name: string;
  file?: string;
  body?: Buffer | Readable;
};

/**
 * Store-only zip whose entries are produced lazily. The Response can be returned at once:
 * there is no Content-Length, and bytes flow after the first entry instead of after all of
 * them (Cloudflare drops the connection after 100 s idle). Each entry is pulled from
 * `entries` only once the client has read the previous one, so preparation is paced by the
 * client and prepared files do not pile up ahead of it.
 */
export function streamZip(entries: AsyncIterable<ZipEntry>): ReadableStream {
  const archive = archiver('zip', { store: true });
  const out = new PassThrough();
  archive.pipe(out);

  let stopped = false;
  let halt!: () => void;
  const halted = new Promise<void>((resolve) => (halt = resolve));
  const stop = () => {
    stopped = true;
    halt();
  };

  const abort = (err: Error) => {
    console.error('[zip] stream error:', err.message);
    stop();
    archive.destroy();
    out.destroy(err);
  };
  archive.on('error', abort);
  archive.on('warning', (err) => console.warn('[zip] warning:', err.message));
  out.on('error', () => {});

  // Readable.toWeb cancels by destroying `out`, so an unfinished close means the client left.
  out.on('close', () => {
    if (out.readableEnded || stopped) return;
    stop();
    archive.abort();
  });

  void (async () => {
    try {
      for await (const entry of entries) {
        if (stopped) break;
        // Register before appending so an 'entry' emitted synchronously is not missed.
        const written = new Promise<void>((resolve) => archive.once('entry', () => resolve()));
        if (entry.file) archive.file(entry.file, { name: entry.name });
        else if (entry.body) archive.append(entry.body, { name: entry.name });
        else throw new Error(`zip entry ${entry.name} has neither file nor body`);
        await Promise.race([written, halted]);
        // archiver acknowledges an entry once it is buffered, not once the client has read it,
        // so hold the next entry until the bytes behind the response have been pulled.
        while (!stopped && (out.readableLength || archive.readableLength || archive.writableLength)) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      if (!stopped) await archive.finalize();
    } catch (err) {
      abort(err as Error);
    }
  })();

  // highWaterMark 0: pull from `out` only on client reads, so the feed runs one entry ahead at most.
  return Readable.toWeb(out, {
    strategy: new CountQueuingStrategy({ highWaterMark: 0 }),
  }) as ReadableStream;
}
