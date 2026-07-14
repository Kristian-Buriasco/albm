'use client';

type Point = { x: number; y: number; label?: string };

function scalePoints(
  data: { x: number; y: number }[],
  width: number,
  height: number,
  pad: number,
): Point[] {
  if (data.length === 0) return [];
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const rx = maxX - minX || 1;
  const ry = maxY - minY || 1;
  return data.map((d) => ({
    x: pad + ((d.x - minX) / rx) * (width - pad * 2),
    y: height - pad - ((d.y - minY) / ry) * (height - pad * 2),
  }));
}

export function LineChart({
  data,
  width = 320,
  height = 120,
  title,
}: {
  data: { x: number; y: number }[];
  width?: number;
  height?: number;
  title?: string;
}) {
  const pts = scalePoints(data, width, height, 8);
  const d =
    pts.length > 0
      ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      : '';
  return (
    <div>
      {title && (
        <p className="mb-2 text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
          {title}
        </p>
      )}
      <svg width={width} height={height} className="text-neutral-900 dark:text-neutral-100">
        <rect width={width} height={height} fill="transparent" />
        {d && (
          <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.8" />
        )}
      </svg>
    </div>
  );
}

export function BarChart({
  items,
  width = 320,
  height = 140,
  title,
}: {
  items: { label: string; value: number }[];
  width?: number;
  height?: number;
  title?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const barW = items.length ? (width - 16) / items.length - 4 : 0;
  return (
    <div>
      {title && (
        <p className="mb-2 text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
          {title}
        </p>
      )}
      <svg width={width} height={height}>
        {items.map((item, i) => {
          const h = (item.value / max) * (height - 24);
          const x = 8 + i * (barW + 4);
          return (
            <g key={item.label}>
              <rect
                x={x}
                y={height - 16 - h}
                width={barW}
                height={h}
                className="fill-neutral-900 dark:fill-neutral-100"
                opacity={0.85}
              />
              <text
                x={x + barW / 2}
                y={height - 2}
                textAnchor="middle"
                className="fill-neutral-500 text-[8px]"
              >
                {item.label.slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
