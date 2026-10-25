"use client";
import { translateText as tx } from "@/lib/translation";

import { useEffect, useState } from "react";
import { Check, ArrowUpRight } from "lucide-react";
import { rpc } from "@/lib/supabase";
import { money } from "@/lib/utils";
import { usePreferences } from "./preferences";
import type { CataloguePlan } from "./package-editor";
type PublicPlan = CataloguePlan & {
  features: { code: string; name: string; name_tr: string }[];
};
export function PublicPricing() {
  const { locale } = usePreferences();
  const [plans, setPlans] = useState<PublicPlan[] | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setError(false);
    rpc<PublicPlan[]>("get_public_plans", {})
      .then((r) => {
        if (live) setPlans(r);
      })
      .catch(() => {
        if (live) setError(true);
      });
    return () => {
      live = false;
    };
  }, [retry]);
  return (
    <>
      {error ? (
        <p role="alert">
          {tx("Pricing is temporarily unavailable.")}
          <button onClick={() => setRetry((x) => x + 1)}>
            {tx("Try again")}
          </button>
        </p>
      ) : plans === null ? (
        <p role="status">{tx("Loading packages…")}</p>
      ) : plans.length === 0 ? (
        <p>{tx("No packages are published yet.")}</p>
      ) : (
        <div className="pricing-grid">
          {plans.map((p) => (
            <article
              key={p.id}
              className={p.id === "growth" ? "pricing-featured" : ""}
            >
              <h3>{tx(p.name)}</h3>
              <p>{locale === "tr" ? p.description_tr : p.description}</p>
              <div className="package-price">
                {money(p.monthly_price_cents, p.currency, locale)}
                <small>
                  / <span>{tx("month")}</span>
                </small>
              </div>
              <ul>
                <li>
                  <Check size={16} />
                  {p.table_limit} <span>{tx("tables")}</span>
                </li>
                <li>
                  <Check size={16} />
                  {p.staff_limit} <span>{tx("staff accounts")}</span>
                </li>
                <li>
                  <Check size={16} />
                  {p.menu_limit} <span>{tx("menu items")}</span>
                </li>
                {p.features.map((f) => (
                  <li key={f.code}>
                    <Check size={16} />
                    {locale === "tr" ? f.name_tr : f.name}
                  </li>
                ))}
              </ul>
              <a className="marketing-cta" href="/login/admin">
                {tx("Get started")}
                <ArrowUpRight size={17} />
              </a>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
