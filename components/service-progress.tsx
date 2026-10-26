"use client";
import { motion, useReducedMotion } from "framer-motion";
import { usePreferences } from "./preferences";
import { translateText as tx } from "@/lib/translation";
import type { Order } from "@/lib/types";
import { ActivityChart } from "./activity-chart";
import { ChefHat, Bell, CheckCircle2, Utensils } from "lucide-react";
export function ServiceProgress({
  orders,
  chart = false,
  onStage,
}: {
  orders: Order[];
  chart?: boolean;
  onStage: (status: string) => void;
}) {
  usePreferences();
  const reduced = useReducedMotion();
  const stages = [
    { id: "placed", name: "Placed", icon: Bell },
    { id: "preparing", name: "Preparing", icon: ChefHat },
    { id: "ready", name: "Ready", icon: Utensils },
    { id: "served", name: "Served", icon: CheckCircle2 },
  ];
  const daily = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 6 + i);
    const day = d.toISOString().slice(0, 10);
    return {
      day,
      orders: orders.filter((o) => o.created_at.slice(0, 10) === day).length,
    };
  });
  return (
    <section className="service-progress">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{tx("Every step counts")}</p>
          <h2>{tx("Your service, in motion")}</h2>
        </div>
        <span className="live-orb">● {tx("Live")}</span>
      </div>
      <div className="journey-stages">
        {stages.map((s, i) => {
          const count = orders.filter((o) => o.status === s.id).length;
          return (
            <motion.button
              key={s.id}
              onClick={() => onStage(s.id)}
              whileHover={reduced ? undefined : { y: -5 }}
              whileTap={reduced ? undefined : { scale: 0.97 }}
              initial={reduced ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <span className="journey-number">0{i + 1}</span>
              <s.icon size={26} />
              <strong>{count}</strong>
              <span>{tx(s.name)}</span>
              <i className={count ? "journey-active" : ""} />
            </motion.button>
          );
        })}
      </div>
      <p className="metric-context">
        {tx(
          "Recent loaded tickets and the active queue. This is not a full-history report.",
        )}
      </p>
      {chart && <ActivityChart data={daily} title={tx("Your last 7 days")} />}
    </section>
  );
}
