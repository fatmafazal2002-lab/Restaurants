"use client";
import { useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TrendingUp, BarChart3 } from "lucide-react";
import { translateText as tx } from "@/lib/translation";
import { usePreferences } from "./preferences";
type Point = { day: string; orders: number };
export function ActivityChart({
  data,
  title = tx("Orders by day"),
}: {
  data: Point[];
  title?: string;
}) {
  const { locale } = usePreferences(),
    id = useId().replaceAll(":", ""),
    reduced = useReducedMotion();
  const [mode, setMode] = useState<"trend" | "bars">("trend"),
    [selected, setSelected] = useState<number | null>(null);
  if (!data.length) return <p>{tx("No orders in this period.")}</p>;
  const max = Math.max(4, ...data.map((d) => d.orders)),
    top = Math.ceil(max / 4) * 4,
    W = 680,
    H = 260,
    left = 42,
    right = 20,
    bottom = 34,
    plotW = W - left - right,
    plotH = H - bottom - 22;
  const x = (i: number) =>
      left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW),
    y = (v: number) => H - bottom - (v / top) * plotH;
  const line = data
      .map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.orders)}`)
      .join(" "),
    area = `${line} L${x(data.length - 1)},${H - bottom} L${x(0)},${H - bottom} Z`;
  const active =
      selected === null ? data.length - 1 : Math.min(selected, data.length - 1),
    point = data[active],
    total = data.reduce((n, d) => n + d.orders, 0);
  const date = (value: string) =>
    new Date(value.slice(0, 10) + "T12:00:00Z").toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return (
    <section className="interactive-chart">
      <div className="chart-heading">
        <div>
          <p className="eyebrow">{tx("Service rhythm")}</p>
          <h3>{title}</h3>
          <p>
            {total.toLocaleString(locale)} {tx("Orders")} · UTC
          </p>
        </div>
        <div className="chart-mode">
          <button
            aria-pressed={mode === "trend"}
            onClick={() => setMode("trend")}
          >
            <TrendingUp size={16} />
            {tx("Trend")}
          </button>
          <button
            aria-pressed={mode === "bars"}
            onClick={() => setMode("bars")}
          >
            <BarChart3 size={16} />
            {tx("Bars")}
          </button>
        </div>
      </div>
      <div className="chart-selected" aria-live="polite">
        <span>{date(point.day)}</span>
        <strong>{point.orders.toLocaleString(locale)}</strong>
        <span>{tx("Orders")}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const relative = ((e.clientX - r.left) / r.width) * W;
          const nearest = Math.round(
            ((relative - left) / plotW) * (data.length - 1),
          );
          setSelected(Math.max(0, Math.min(data.length - 1, nearest)));
        }}
      >
        <defs>
          <linearGradient id={`chart-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity=".32" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity=".015" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((n) => (
          <g key={n}>
            <line
              x1={left}
              x2={W - right}
              y1={y((top * n) / 4)}
              y2={y((top * n) / 4)}
              stroke="var(--border)"
              strokeDasharray="3 6"
            />
            <text x={left - 10} y={y((top * n) / 4) + 4} textAnchor="end">
              {(top * n) / 4}
            </text>
          </g>
        ))}
        {mode === "trend" ? (
          <>
            <motion.path
              key={`area-${data.length}`}
              d={area}
              fill={`url(#chart-${id})`}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
            />
            <motion.path
              key={`line-${data.length}`}
              d={line}
              fill="none"
              stroke="var(--brand)"
              strokeWidth={3}
              strokeLinejoin="round"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.8 }}
            />
          </>
        ) : (
          data.map((d, i) => (
            <motion.rect
              key={d.day}
              x={x(i) - Math.min(18, (plotW / data.length) * 0.6) / 2}
              y={y(d.orders)}
              width={Math.min(18, (plotW / data.length) * 0.6)}
              height={H - bottom - y(d.orders)}
              rx={4}
              fill="var(--brand)"
              opacity={i === active ? 1 : 0.45}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: i === active ? 1 : 0.45 }}
            />
          ))
        )}
        <line
          x1={x(active)}
          x2={x(active)}
          y1={16}
          y2={H - bottom}
          stroke="var(--brand)"
          opacity=".35"
          strokeDasharray="4 5"
        />
        <circle
          cx={x(active)}
          cy={y(point.orders)}
          r={7}
          fill="var(--surface,#fff)"
          stroke="var(--brand)"
          strokeWidth={3}
        />
        {[
          ...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]),
        ].map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={
              i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"
            }
          >
            {date(data[i].day)}
          </text>
        ))}
      </svg>
      <input
        type="range"
        min={0}
        max={data.length - 1}
        value={active}
        onChange={(e) => setSelected(Number(e.target.value))}
        aria-label={tx("Explore dates")}
      />
      <small>{tx("Hover, touch or use the slider to explore each day.")}</small>
    </section>
  );
}
export function StatusDonut({
  values,
}: {
  values: { name: string; value: number; color: string }[];
}) {
  usePreferences();
  const [active, setActive] = useState<number | null>(null);
  const total = values.reduce((s, v) => s + v.value, 0),
    circ = 2 * Math.PI * 70;
  let offset = 0;
  return (
    <section className="status-donut">
      <h3>{tx("Order balance")}</h3>
      <div className="donut-visual">
        <svg viewBox="0 0 180 180" role="img" aria-label={tx("Order balance")}>
          <circle
            cx={90}
            cy={90}
            r={70}
            fill="none"
            stroke="var(--border)"
            strokeWidth={16}
          />
          {values.map((v, i) => {
            const start = offset;
            offset += total ? (v.value / total) * circ : 0;
            return (
              <circle
                key={v.name}
                cx={90}
                cy={90}
                r={70}
                fill="none"
                stroke={v.color}
                strokeWidth={active === i ? 22 : 16}
                strokeDasharray={`${total ? (v.value / total) * circ : 0} ${circ}`}
                strokeDashoffset={-start}
                transform="rotate(-90 90 90)"
                opacity={active === null || active === i ? 1 : 0.25}
                className="donut-segment"
              />
            );
          })}
        </svg>
        <div>
          <strong>{active === null ? total : values[active].value}</strong>
          <span>{active === null ? tx("Orders") : values[active].name}</span>
        </div>
      </div>
      <div className="donut-legend">
        {values.map((v, i) => (
          <button
            key={v.name}
            aria-pressed={active === i}
            onClick={() => setActive(active === i ? null : i)}
          >
            <i style={{ background: v.color }} />
            {v.name}
            <strong>{v.value}</strong>
          </button>
        ))}
      </div>
      {total === 0 && <p>{tx("No orders in this period.")}</p>}
    </section>
  );
}
