import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import type { T } from "./shared";
import { statusFlow, type Status, type Order } from "@/lib/types";
export function Ticket({
  order: o,
  t,
  locale,
  action,
  canAct,
  busy,
  children,
}: {
  order: Order;
  t: T;
  locale: string;
  action?: (next: Status) => void;
  canAct?: (next: Status) => boolean;
  busy: boolean;
  children?: ReactNode;
}) {
  const next = statusFlow[statusFlow.indexOf(o.status) + 1];
  const delayed =
    ["placed", "preparing"].includes(o.status) &&
    Date.now() - Date.parse(o.created_at) > 15 * 60000;
  return (
    <article className={`ticket panel ticket-${o.status}`}>
      <div className="section-heading">
        <div>
          <span className="ticket-id">#{o.id.slice(0, 6)}</span>
          <h2>{o.table_name}</h2>
        </div>
        <span className={`status ${o.status}`}>{t(o.status)}</span>
      </div>
      <small>
        {new Date(o.created_at).toLocaleTimeString(locale, {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </small>
      {delayed && <div className="delay">{t("delayed")}</div>}
      <div className="ticket-items">
        {o.order_items.map((item) => (
          <div className={item.cancelled ? "cancelled-item" : ""} key={item.id}>
            <span className="quantity-badge">{item.quantity}</span>
            <div>
              <strong>{item.name}</strong>
              {item.instructions && <p>{item.instructions}</p>}
              {item.cancelled && <small>{t("cancelled")}</small>}
            </div>
          </div>
        ))}
      </div>
      {next && canAct?.(next) && (
        <Button disabled={busy} onClick={() => action?.(next)}>
          {t(
            next === "preparing"
              ? "start"
              : next === "ready"
                ? "markReady"
                : "markServed",
          )}
          <ArrowRight size={17} />
        </Button>
      )}
      {children}
    </article>
  );
}
