"use client";
import { ActivityChart, StatusDonut } from "./activity-chart";
import { translateText as tx } from "@/lib/translation";

import { useEffect, useState } from "react";
import { rpc } from "@/lib/platform-supabase";
import { money, errorMessage } from "@/lib/utils";
import { Button } from "./ui/button";
import { usePreferences } from "./preferences";
type Report = {
  generated_at: string;
  from: string;
  to: string;
  days: number;
  restaurants: number;
  active_restaurants: number;
  staff_accounts: number;
  tables: number;
  menu_items: number;
  orders: number;
  served: number;
  cancelled: number;
  open_orders: number;
  avg_preparation_minutes: number | null;
  average_rating: number | null;
  rating_count: number;
  unresolved_requests: number;
  currency_totals: {
    currency: string;
    served_orders: number;
    served_value_cents: number;
  }[];
  catalogue_monthly_value: {
    currency: string;
    catalogue_cents: number;
    restaurants: number;
  }[];
  daily: { day: string; orders: number }[];
  top_restaurants: {
    id: string;
    name: string;
    currency: string;
    orders: number;
    served_value_cents: number;
  }[];
  plan_distribution: { id: string; name: string; restaurants: number }[];
};
export function PlatformInsights({ refreshKey }: { refreshKey: number }) {
  const { locale } = usePreferences();
  const [days, setDays] = useState(30),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setReport(null);
    setError("");
    rpc<Report>("platform_analytics", { p_days: days })
      .then((r) => {
        if (current) setReport(r);
      })
      .catch((e) => {
        if (current) setError(errorMessage(e));
      });
    return () => {
      current = false;
    };
  }, [days, refreshKey]);
  return (
    <section className="panel insights">
      <div className="section-heading">
        <div>
          <h2>{tx("Platform analytics")}</h2>
          <p>
            {tx(
              "Aggregated directly from the database. No sample data or estimated sales.",
            )}
          </p>
        </div>
        <select
          aria-label={tx("Reporting period")}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>{tx("Last 7 days")}</option>
          <option value={30}>{tx("Last 30 days")}</option>
          <option value={90}>{tx("Last 90 days")}</option>
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      {!report && !error && <p role="status">{tx("Loading analytics…")}</p>}
      {report && (
        <>
          <p className="metric-context">
            <time>
              {new Date(report.from).toLocaleString(locale, {
                timeZone: "UTC",
              })}
            </time>{" "}
            —{" "}
            <time>
              {new Date(report.to).toLocaleString(locale, { timeZone: "UTC" })}
            </time>{" "}
            · UTC
          </p>
          <div className="analytics-grid">
            {[
              [tx("Orders created"), report.orders],
              [tx("Served orders"), report.served],
              [tx("Cancelled orders"), report.cancelled],
              [tx("Open orders in period"), report.open_orders],
              [
                tx("Average preparation (minutes)"),
                report.avg_preparation_minutes ?? "—",
              ],
              [tx("Average guest rating"), report.average_rating ?? "—"],
              [tx("Unique staff accounts"), report.staff_accounts],
              [tx("Active tables"), report.tables],
              [tx("Menu items"), report.menu_items],
              [tx("Unresolved requests"), report.unresolved_requests],
            ].map(([name, value]) => (
              <article key={name}>
                <span>{name}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <div className="insight-columns">
            <div>
              <h3>{tx("Served order value")}</h3>
              <p>
                {tx(
                  "Only served orders; cancelled line items excluded. This is order value, not collected payments.",
                )}
              </p>
              {report.currency_totals.length ? (
                report.currency_totals.map((v) => (
                  <div className="metric-row" key={v.currency}>
                    <strong>
                      {money(Number(v.served_value_cents), v.currency, locale)}
                    </strong>
                    <span>
                      {v.served_orders} <span>{tx("served orders")}</span>
                    </span>
                  </div>
                ))
              ) : (
                <p>{tx("No orders in this period.")}</p>
              )}
            </div>
            <div>
              <h3>{tx("Monthly catalogue value")}</h3>
              <p>
                {tx(
                  "Current active restaurants × their package list price. Not billed revenue, MRR, or proof of payment.",
                )}
              </p>
              {report.catalogue_monthly_value.map((v) => (
                <div className="metric-row" key={v.currency}>
                  <strong>
                    {money(Number(v.catalogue_cents), v.currency, locale)}
                  </strong>
                  <span>
                    {v.restaurants} <span>{tx("active restaurants")}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-pair">
            <ActivityChart data={report.daily} />
            <StatusDonut
              values={[
                { name: tx("Served"), value: report.served, color: "#4c9274" },
                {
                  name: tx("Open"),
                  value: report.open_orders,
                  color: "#b89453",
                },
                {
                  name: tx("Cancelled"),
                  value: report.cancelled,
                  color: "#b16b70",
                },
              ]}
            />
          </div>
          <details>
            <summary>{tx("View daily source values")}</summary>
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>{tx("Date (UTC)")}</th>
                    <th>{tx("Orders")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.daily.map((d) => (
                    <tr key={d.day}>
                      <td>{d.day}</td>
                      <td>{d.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <h3>{tx("Restaurants by order volume")}</h3>
          <p>
            {tx(
              "Top 20 in the selected period. Values remain in each restaurant’s currency.",
            )}
          </p>
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>{tx("Restaurant")}</th>
                  <th>{tx("Orders")}</th>
                  <th>{tx("Served order value")}</th>
                </tr>
              </thead>
              <tbody>
                {report.top_restaurants.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.orders}</td>
                    <td>
                      {money(Number(r.served_value_cents), r.currency, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="metric-definitions">
            <summary>{tx("How these numbers are calculated")}</summary>
            <p>
              {tx(
                "Order metrics use orders created within the UTC date range and their current status. Preparation time averages ready time minus preparation start, only where both timestamps exist. Ratings use feedback submitted in the range; sample size:",
              )}
            </p>
            <strong>{report.rating_count}</strong>
            <p>
              {tx(
                "Restaurant, staff, table, menu, unresolved request, package distribution and catalogue counts are current all-time snapshots. Different currencies are never added together. Missing averages are shown as a dash. No tax, refunds or payment transactions are recorded by these metrics.",
              )}
            </p>
            <p>{tx("Snapshot generated:")}</p>
            <time>
              {new Date(report.generated_at).toLocaleString(locale, {
                timeZone: "UTC",
              })}{" "}
              UTC
            </time>
          </details>
          <Button
            variant="outline"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([JSON.stringify(report, null, 2)], {
                  type: "application/json",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = `mise-analytics-${days}days.json`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            {tx("Download source report (JSON)")}
          </Button>
        </>
      )}
    </section>
  );
}
