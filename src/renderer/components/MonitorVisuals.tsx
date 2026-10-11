import { useId } from "react";
import type { ReactNode } from "react";

export const monitorColors = {
  cyan: "#38bdf8",
  teal: "#2dd4bf",
  violet: "#a78bfa",
  amber: "#fbbf24",
  rose: "#fb7185",
};
export const monitorCompact = (value: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
export const monitorBytes = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GiB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(0)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KiB`;
  return `${value} B`;
};
export const monitorPercent = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `${value.toFixed(value < 10 ? 1 : 0)}%`;

export function MonitorBlock({
  title,
  icon,
  extra,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-border bg-background/50 ${className}`}
      aria-label={title}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-ui-xs font-semibold uppercase tracking-wider text-foreground-subtle">
          {icon}
          {title}
        </h3>
        {extra}
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

export function MonitorMeter({
  value,
  label,
  color = monitorColors.teal,
  context = false,
  small = false,
}: {
  value: number | null;
  label: string;
  color?: string;
  context?: boolean;
  small?: boolean;
}) {
  const percent = value === null ? null : Math.min(100, Math.max(0, value));
  return (
    <div
      className={`flex gap-[2px] ${small ? "h-1.5" : "h-2.5"}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-valuetext={percent === null ? "Unavailable" : `${Math.round(percent)} percent`}
    >
      {Array.from({ length: 24 }, (_, index) => (
        <span
          key={index}
          className="min-w-0 flex-1 rounded-[1px]"
          style={{
            backgroundColor:
              percent !== null && (index / 24) * 100 < percent
                ? context
                  ? index < 17
                    ? monitorColors.teal
                    : index < 21
                      ? monitorColors.amber
                      : monitorColors.rose
                  : color
                : "var(--color-border)",
            opacity: percent !== null && (index / 24) * 100 < percent ? 1 : 0.5,
          }}
        />
      ))}
    </div>
  );
}

export function MonitorTrend({
  values,
  color = monitorColors.teal,
  label,
  max,
  bars = false,
  compact = false,
}: {
  values: (number | null)[];
  color?: string;
  label: string;
  max?: number;
  bars?: boolean;
  compact?: boolean;
}) {
  const gradient = useId();
  const points = values.slice(-90);
  const available = points.some((value) => value !== null);
  const scale = Math.max(max ?? 0, ...points.map((value) => value ?? 0), 1);
  const x = (index: number) => (points.length <= 1 ? 358 : 2 + (index / (points.length - 1)) * 356);
  const y = (value: number) => 76 - Math.min(1, Math.max(0, value / scale)) * 68;
  const segments: { x: number; y: number }[][] = [];
  let segment: { x: number; y: number }[] = [];
  points.forEach((value, index) => {
    if (value === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push({ x: x(index), y: y(value) });
  });
  if (segment.length) segments.push(segment);
  return (
    <div className={`relative w-full ${compact ? "h-10" : "h-16"}`}>
      <svg
        role="img"
        aria-label={label}
        viewBox="0 0 360 84"
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[8, 30, 52, 76].map((line) => (
          <line
            key={line}
            x1="0"
            x2="360"
            y1={line}
            y2={line}
            stroke="currentColor"
            className="text-border"
            strokeDasharray="2 5"
          />
        ))}
        {bars
          ? points.map((value, index) =>
              value === null ? null : (
                <rect
                  key={index}
                  x={Math.max(1, x(index) - Math.min(5, 140 / Math.max(1, points.length)))}
                  y={y(value)}
                  width={Math.min(10, 280 / Math.max(1, points.length))}
                  height={Math.max(0, 76 - y(value))}
                  rx="1"
                  fill={color}
                  opacity={0.35 + ((index + 1) / Math.max(1, points.length)) * 0.65}
                />
              ),
            )
          : segments.map((part, index) => {
              const first = part[0]!;
              const last = part.at(-1)!;
              const path = part
                .map((point, i) => `${i ? "L" : "M"}${point.x},${point.y}`)
                .join(" ");
              return (
                <g key={index}>
                  <path d={`${path} L${last.x},76 L${first.x},76 Z`} fill={`url(#${gradient})`} />
                  <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                  />
                  <circle cx={last.x} cy={last.y} r="2.5" fill={color} />
                </g>
              );
            })}
      </svg>
      {!available && (
        <div className="absolute inset-0 flex items-center justify-center text-ui-xs text-foreground-subtlest">
          Collecting samples…
        </div>
      )}
    </div>
  );
}
