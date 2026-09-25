import { formatDateShort, unitMoney } from "@/lib/format.ts";

export type Point = { date: string; price: number; vendor: string };

// Narrow-ish and capped below, because an SVG scales its text with its box:
// too wide a viewBox and the axis labels shrink to nothing on a phone.
const W = 520;
const H = 190;
const PAD = { top: 18, right: 18, bottom: 30, left: 52 };

/**
 * Unit price over time. One series, so no legend: the heading names it.
 *
 * ponytail: native SVG <title> per marker instead of a crosshair tooltip. It is
 * a real per-mark tooltip with no JavaScript, and every value is also in the
 * table directly below. Upgrade to a crosshair if this chart ever gets dense
 * enough that hitting a marker is fiddly.
 */
export function PriceChart({ points }: { points: Point[] }) {
  if (points.length < 2) return null;

  const times = points.map((p) => new Date(p.date).getTime());
  const prices = points.map((p) => p.price);

  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  // Pad the value range so the line is not glued to the frame, and never
  // divide by zero when every price is identical.
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const span = rawMax - rawMin || Math.max(rawMax * 0.1, 1);
  const minP = rawMin - span * 0.25;
  const maxP = rawMax + span * 0.25;

  const x = (t: number) =>
    PAD.left + ((t - minT) / (maxT - minT || 1)) * (W - PAD.left - PAD.right);
  const y = (p: number) =>
    PAD.top + (1 - (p - minP) / (maxP - minP)) * (H - PAD.top - PAD.bottom);

  const coords = points.map((p, i) => ({ ...p, cx: x(times[i]), cy: y(p.price) }));
  const path = coords.map((c, i) => `${i ? "L" : "M"}${c.cx.toFixed(1)} ${c.cy.toFixed(1)}`).join(" ");

  const first = coords[0];
  const last = coords[coords.length - 1];

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-[520px] text-[#0B6BCB] dark:text-[#4A93E8]"
        role="img"
        aria-label={`Unit price from ${unitMoney(first.price)} on ${formatDateShort(first.date)} to ${unitMoney(last.price)} on ${formatDateShort(last.date)}. Every value is listed in the table below.`}
      >
        {/* Recessive gridlines: three ticks, ink tokens at low opacity. */}
        {[rawMin, (rawMin + rawMax) / 2, rawMax].map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke="currentColor"
              strokeOpacity="0.12"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={y(value) + 4}
              textAnchor="end"
              className="fill-black text-[15px] opacity-50 dark:fill-white"
            >
              {Math.round(value)}
            </text>
          </g>
        ))}

        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />

        {coords.map((c) => (
          <circle
            key={`${c.date}-${c.vendor}`}
            cx={c.cx}
            cy={c.cy}
            r="4.5"
            fill="currentColor"
            // A surface ring, so overlapping markers stay countable.
            stroke="var(--background)"
            strokeWidth="2"
          >
            <title>{`${formatDateShort(c.date)} · ${c.vendor} · ${unitMoney(c.price)}`}</title>
          </circle>
        ))}

        {/* Direct labels on the ends only, never a number on every point. */}
        <text
          x={first.cx}
          y={H - 9}
          textAnchor="start"
          className="fill-black text-[14px] opacity-60 dark:fill-white"
        >
          {formatDateShort(first.date)}
        </text>
        <text
          x={last.cx}
          y={H - 9}
          textAnchor="end"
          className="fill-black text-[14px] opacity-60 dark:fill-white"
        >
          {formatDateShort(last.date)}
        </text>
      </svg>
    </figure>
  );
}
