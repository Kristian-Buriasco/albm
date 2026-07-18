'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart } from '@/components/AdminCharts';
import SegmentedControl from '@/components/SegmentedControl';
import type { GalleryInsights } from '@/lib/analytics';
import type { DeliveryState, TimelineItem } from '@/lib/lifecycle';

const STATE_LABEL: Record<DeliveryState, string> = {
  proofing: 'Proofing',
  retouching: 'Retouching',
  delivered: 'Delivered',
};

function timelineLabel(it: TimelineItem): string {
  switch (it.kind) {
    case 'created':
      return 'Gallery created';
    case 'first_view':
      return 'First viewed by a visitor';
    case 'first_selection':
      return 'First selection made';
    case 'note':
      return it.note ?? 'Note';
    case 'state_change':
      return `Marked ${it.to ?? ''}${it.from ? ` (from ${it.from})` : ''}`;
    default:
      return '';
  }
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function InsightsPanel({
  galleryId,
  insights,
  timeline,
  deliveryState,
}: {
  galleryId: string;
  insights: GalleryInsights;
  timeline: TimelineItem[];
  deliveryState: DeliveryState;
}) {
  const router = useRouter();
  const [state, setState] = useState<DeliveryState>(deliveryState);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function changeState(next: DeliveryState) {
    if (next === state || busy) return;
    setBusy(true);
    setState(next);
    const res = await fetch(`/api/admin/galleries/${galleryId}/delivery`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: next }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setState(deliveryState);
  }

  async function addNote() {
    const trimmed = note.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const res = await fetch(`/api/admin/galleries/${galleryId}/delivery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: trimmed }),
    });
    setBusy(false);
    if (res.ok) {
      setNote('');
      router.refresh();
    }
  }

  const trendData = insights.viewTrend.map((p, i) => ({ x: i, y: p.count, label: p.day }));
  const tiles = [
    { label: 'Total views', value: insights.totalViews },
    { label: 'Unique visitors', value: insights.uniqueVisitors },
    { label: 'Selectors', value: insights.conversion.selectors },
    { label: 'Conversion', value: `${insights.conversion.rate}%` },
  ];

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-2xl font-medium tabular-nums">
              {typeof t.value === 'number' ? t.value.toLocaleString() : t.value}
            </p>
            <p className="mt-1 text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
              {t.label}
            </p>
          </div>
        ))}
      </div>

      <LineChart data={trendData} title="Views (30 days)" />

      {/* Peak viewing hours */}
      <section className="space-y-4">
        <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
          Peak viewing hours
        </h2>
        <div className="flex h-24 items-end gap-1">
          {insights.peakHours && insights.peakHours.length === 24 ? (
            (() => {
              const maxValue = Math.max(...insights.peakHours);
              return insights.peakHours.map((count, hour) => (
                <div key={hour} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-neutral-900 dark:bg-neutral-100"
                    style={{
                      height: maxValue === 0 ? '2px' : `${(count / maxValue) * 100}%`,
                    }}
                  />
                  {[0, 6, 12, 18].includes(hour) && (
                    <span className="text-[10px] text-neutral-500">{hour}</span>
                  )}
                </div>
              ));
            })()
          ) : (
            <p className="text-xs text-neutral-500">No data yet.</p>
          )}
        </div>
      </section>

      {/* Locations and referrers */}
      <div className="grid gap-8 md:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Top locations
          </h2>
          {insights.topCities && insights.topCities.length > 0 ? (
            <div className="space-y-2">
              {insights.topCities.map((city) => (
                <div key={city.label} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700 dark:text-neutral-300">{city.label}</span>
                  <span className="text-neutral-500 tabular-nums">{city.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-500">No data yet.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
            Traffic sources
          </h2>
          {insights.referrers && insights.referrers.length > 0 ? (
            <div className="space-y-2">
              {insights.referrers.map((ref) => (
                <div key={ref.label} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700 dark:text-neutral-300">{ref.label}</span>
                  <span className="text-neutral-500 tabular-nums">{ref.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-500">No data yet.</p>
          )}
        </section>
      </div>

      {/* Delivery lifecycle */}
      <section className="space-y-4">
        <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
          Delivery
        </h2>
        <SegmentedControl
          label="Stage"
          value={state}
          options={[
            { value: 'proofing', label: STATE_LABEL.proofing },
            { value: 'retouching', label: STATE_LABEL.retouching },
            { value: 'delivered', label: STATE_LABEL.delivered },
          ]}
          onChange={(v) => changeState(v as DeliveryState)}
        />
        <div className="flex items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note to the timeline…"
            className="flex-1 border-b border-neutral-300 bg-transparent py-1.5 text-sm outline-none focus:border-neutral-900 dark:border-neutral-700"
          />
          <button
            type="button"
            onClick={addNote}
            disabled={busy || !note.trim()}
            className="border border-neutral-300 px-3 py-1 text-xs disabled:opacity-40 dark:border-neutral-700"
          >
            Add
          </button>
        </div>
        <ol className="space-y-3 border-l border-neutral-200 pl-4 dark:border-neutral-800">
          {timeline.map((it, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-neutral-400 dark:bg-neutral-600" />
              <p className="text-sm">{timelineLabel(it)}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{fmt(it.at)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Per-photo engagement */}
      <section className="space-y-3">
        <h2 className="text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
          Per-photo engagement
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 dark:border-neutral-800">
                <th className="py-2 pr-3 font-normal">Photo</th>
                <th className="py-2 pr-3 text-right font-normal">Views</th>
                <th className="py-2 pr-3 text-right font-normal">Downloads</th>
                <th className="py-2 text-right font-normal">Likes</th>
              </tr>
            </thead>
            <tbody>
              {insights.perPhoto.slice(0, 50).map((p) => (
                <tr key={p.photoId} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/img/${p.photoId}/thumb`}
                        alt=""
                        loading="lazy"
                        className="h-8 w-8 shrink-0 rounded object-cover"
                      />
                      <span className="truncate">{p.filename}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{p.views}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{p.downloads}</td>
                  <td className="py-2 text-right tabular-nums">{p.likes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
