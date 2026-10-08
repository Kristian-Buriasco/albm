'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

export default function ShareTools({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    QRCode.toString(url, { type: 'svg', margin: 1, width: 160 })
      .then(setQrSvg)
      .catch(() => setQrSvg(null));
  }, [url]);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function downloadQr() {
    if (!canvasRef.current) return;
    try {
      await QRCode.toCanvas(canvasRef.current, url, { width: 512, margin: 2 });
      const link = document.createElement('a');
      link.download = 'gallery-qr.png';
      link.href = canvasRef.current.toDataURL('image/png');
      link.click();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-4">
      <button
        type="button"
        onClick={copyLink}
        className="border border-neutral-300 px-3 py-1 transition-colors hover:border-neutral-900 dark:border-neutral-700 dark:hover:border-neutral-100"
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {qrSvg && (
        <button
          type="button"
          onClick={downloadQr}
          className="group"
          title="Click to download QR as PNG"
        >
          <div
            className="rounded border border-neutral-200 bg-white p-2 dark:border-neutral-700 [&>svg]:h-auto [&>svg]:w-32 sm:[&>svg]:w-44"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <span className="mt-1 block text-[10px] text-neutral-500 group-hover:underline">
            Download QR
          </span>
        </button>
      )}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
