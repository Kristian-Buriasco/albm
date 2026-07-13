import fs from 'node:fs';
import { Readable } from 'node:stream';

/**
 * Stream a file from disk as a Response without buffering it in memory.
 * Supports ETag (mtime+size) / If-None-Match.
 */
export function streamFileResponse(
  req: Request,
  filePath: string,
  opts: {
    contentType: string;
    cacheControl: string;
    downloadName?: string;
  },
): Response {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const etag = `"${stat.mtimeMs.toString(16)}-${stat.size.toString(16)}"`;
  const headers: Record<string, string> = {
    'Content-Type': opts.contentType,
    'Cache-Control': opts.cacheControl,
    ETag: etag,
  };
  if (opts.downloadName) {
    headers['Content-Disposition'] =
      `attachment; filename="${opts.downloadName.replaceAll('"', '')}"`;
  }

  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  headers['Content-Length'] = String(stat.size);
  const nodeStream = fs.createReadStream(filePath);
  const body = Readable.toWeb(nodeStream) as ReadableStream;
  return new Response(body, { status: 200, headers });
}

export function contentTypeForFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}
