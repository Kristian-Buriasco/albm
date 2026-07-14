'use client';

type InputPoint = { x: number; y: number; label?: string };
type Point = { x: number; y: number; value: number; label?: string };

const EMPTY = (
  <p className="flex h-full min-h-[80px] items-center justify-center text-xs text-neutral-400 dark:text-neutral-600">
    Not enough data yet
  </p>
);

function ChartFrame({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {title && (
        <p className="mb-2 text-xs tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

function scalePoints(
  data: InputPoint[],
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
    // With a single point, place it centered rather than at the left edge.
    x:
      data.length === 1
        ? width / 2
        : pad + ((d.x - minX) / rx) * (width - pad * 2),
    y: height - pad - ((d.y - minY) / ry) * (height - pad * 2),
    value: d.y,
    label: d.label,
  }));
}

export function LineChart({
  data,
  width = 320,
  height = 120,
  title,
}: {
  data: InputPoint[];
  width?: number;
  height?: number;
  title?: string;
}) {
  const pad = 8;
  const pts = scalePoints(data, width, height, pad);

  // A single data point has no "line" and maps to the top (it's the max),
  // which looks cramped. Center it and present it as a clear stat instead.
  if (pts.length === 1) {
    const only = data[0];
    return (
      <ChartFrame title={title}>
        <div
          className="flex flex-col items-center justify-center text-neutral-900 dark:text-neutral-100"
          style={{ width, height }}
        >
          <span className="text-3xl font-light tabular-nums">{only.y}</span>
          <span className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            {only.label ? `${only.label} · ` : ''}
            {only.y === 1 ? 'view' : 'views'}
          </span>
        </div>
      </ChartFrame>
    );
  }

  let body: React.ReactNode;
  if (pts.length === 0) {
    body = EMPTY;
  } else {
    const baselineY = height - pad;
    body = (
      <svg
        width={width}
        height={height}
        className="text-neutral-900 dark:text-neutral-100"
      >
        {/* baseline for context so a sparse chart doesn't look empty */}
        <line
          x1={pad}
          y1={baselineY}
          x2={width - pad}
          y2={baselineY}
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.15"
        />
        {pts.length >= 2 && (
          <path
            d={pts
              .map(
                (p, i) =>
                  `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`,
              )
              .join(' ')}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.85"
          />
        )}
        {/* mark each point and, when there aren't too many, label the value
            inline (readable without hover — React 19 hoists SVG <title>, so
            a native tooltip is unreliable). */}
        {pts.map((p, i) => (
          <g key={i}>
            {pts.length <= 14 && (
              <text
                x={p.x}
                y={p.y - 6 < 9 ? p.y + 12 : p.y - 6}
                textAnchor="middle"
                className="fill-neutral-500 text-[9px]"
              >
                {p.value}
              </text>
            )}
            <circle cx={p.x} cy={p.y} r={2.5} fill="currentColor" opacity="0.85" />
          </g>
        ))}
      </svg>
    );
  }

  return <ChartFrame title={title}>{body}</ChartFrame>;
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
  if (items.length === 0) {
    return <ChartFrame title={title}>{EMPTY}</ChartFrame>;
  }

  const max = Math.max(1, ...items.map((i) => i.value));
  const gap = 8;
  const maxBarW = 48; // cap so a single bar doesn't fill the whole chart
  const available = width - 16;
  const barW = Math.min(maxBarW, available / items.length - gap);
  const groupW = barW + gap;
  const usedW = items.length * groupW - gap;
  const startX = (width - usedW) / 2; // center the bars

  return (
    <ChartFrame title={title}>
      <svg width={width} height={height}>
        {items.map((item, i) => {
          const h = Math.max(1, (item.value / max) * (height - 32));
          const x = startX + i * groupW;
          return (
            <g key={item.label}>
              <rect
                x={x}
                y={height - 16 - h}
                width={barW}
                height={h}
                rx={2}
                className="fill-neutral-900 dark:fill-neutral-100"
                opacity={0.85}
              />
              <text
                x={x + barW / 2}
                y={height - 20 - h}
                textAnchor="middle"
                className="fill-neutral-500 text-[9px]"
              >
                {item.value}
              </text>
              <text
                x={x + barW / 2}
                y={height - 4}
                textAnchor="middle"
                className="fill-neutral-500 text-[8px]"
              >
                {item.label.slice(0, 8)}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}
