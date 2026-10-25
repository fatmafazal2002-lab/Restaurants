"use client";
import { translateText as tx } from "@/lib/translation";

import { PreferenceControls, usePreferences } from "./preferences";
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type FormEvent,
} from "react";
import type { User } from "@supabase/supabase-js";
import { Building2, ShieldCheck, Search, RefreshCw } from "lucide-react";
import { supabase, rpc } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { PlatformInsights } from "./platform-insights";
import { PackageEditor } from "./package-editor";
import { SignOutButton } from "./sign-out-button";
import { Button } from "./ui/button";
import { Field } from "./shared";
type Plan = {
  id: string;
  name: string;
  table_limit: number;
  staff_limit: number;
  menu_limit: number;
};
type Audit = {
  id: number;
  restaurant_id: string;
  event: string;
  created_at: string;
};
export function PlatformConsole() {
  const { locale } = usePreferences();

  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(!supabase),
    [allowed, setAllowed] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]),
    [plans, setPlans] = useState<Plan[]>([]),
    [audit, setAudit] = useState<Audit[]>([]),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);
  const version = useRef(0);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      version.current++;
      setUser(session?.user ?? null);
      setAllowed(false);
      setRestaurants([]);
      setAudit([]);
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const gen = ++version.current;
    setLoading(true);
    setError("");
    try {
      const permission = await rpc<boolean>("is_platform_admin", {});
      if (gen !== version.current) return;
      setAllowed(permission);
      if (!permission) return;
      const [rs, ps, logs] = await Promise.all([
        supabase
          .from("restaurants")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase.from("plans").select("*").order("table_limit"),
        supabase
          .from("audit_logs")
          .select("id,restaurant_id,event,created_at")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);
      for (const result of [rs, ps, logs]) if (result.error) throw result.error;
      if (gen !== version.current) return;
      setRestaurants(rs.data ?? []);
      setPlans(ps.data ?? []);
      setAudit(logs.data ?? []);
    } catch (e) {
      if (gen === version.current) setError(errorMessage(e));
    } finally {
      if (gen === version.current) setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy("login");
    const f = new FormData(e.currentTarget);
    try {
      if (!supabase) throw new Error(tx("Supabase is not configured."));
      const { error } = await supabase.auth.signInWithPassword({
        email: String(f.get("email")),
        password: String(f.get("password")),
      });
      if (error) throw error;
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  }
  const visible = restaurants.filter(
    (r) =>
      (status === "all" || (status === "active" ? r.active : !r.active)) &&
      `${r.name} ${r.slug}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="platform-shell">
      <header className="platform-header">
        <a href="/" className="wordmark">
          mise<span>✳</span>
        </a>
        <span className="platform-badge">
          <ShieldCheck size={16} />
          {tx("App administration")}
        </span>
        <PreferenceControls />
        <div>
          {user && (
            <>
              <span className="platform-email">{user.email}</span>
              <SignOutButton redirect="/platform" />
            </>
          )}
        </div>
      </header>
      {!ready || (user && loading && !allowed) ? (
        <main className="platform-access">
          <p role="status">{tx("Checking app-admin access…")}</p>
        </main>
      ) : !user ? (
        <main className="platform-access">
          <ShieldCheck size={36} />
          <h1>
            {tx("Your app.")}
            <br />
            {tx("One control room.")}
          </h1>
          <p>
            {tx(
              "Sign in with the account designated as the Mise app administrator. Restaurant staff accounts cannot access this console.",
            )}
          </p>
          <form onSubmit={login}>
            <Field label={tx("Email")}>
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </Field>
            <Field label={tx("Password")}>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
            <Button disabled={!!busy || !supabase}>
              {busy ? tx("Signing in…") : tx("Sign in as app admin")}
            </Button>
          </form>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <a href="/login/admin">
            {tx("Looking for your restaurant? Open restaurant login →")}
          </a>
        </main>
      ) : !allowed ? (
        <main className="platform-access">
          <ShieldCheck size={36} />
          <h1>{tx("App-admin access required")}</h1>
          <p>
            {tx("You are signed in as")}
            <strong>{user.email}</strong>
            {tx(". This account has not been granted app-wide administration.")}
          </p>
          <p>
            {tx(
              "App-admin access must be assigned by the platform operator. Restaurant ownership alone does not grant it.",
            )}
          </p>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <Button
            onClick={() => {
              void load();
              setRevision((x) => x + 1);
            }}
          >
            {tx("Check access again")}
          </Button>
          <a href="/admin">{tx("Return to restaurant workspace →")}</a>
        </main>
      ) : (
        <main className="platform-main">
          <div className="platform-title">
            <div>
              <p className="eyebrow">{tx("MISE CONTROL ROOM")}</p>
              <h1>{tx("Your restaurants, at a glance.")}</h1>
              <p>
                {tx(
                  "Manage restaurant availability and package capacity across the app.",
                )}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void load();
                setRevision((x) => x + 1);
              }}
              disabled={loading}
            >
              <RefreshCw size={16} />
              {loading ? tx("Refreshing…") : tx("Refresh")}
            </Button>
          </div>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="platform-notice" role="status">
              {notice}
            </p>
          )}
          <div className="platform-stats">
            {[
              [tx("Restaurants"), restaurants.length],
              [tx("Active"), restaurants.filter((r) => r.active).length],
              [tx("Suspended"), restaurants.filter((r) => !r.active).length],
              [tx("Available packages"), plans.length],
            ].map(([label, value]) => (
              <section className="panel" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </section>
            ))}
          </div>
          <PlatformInsights refreshKey={revision} />
          <PackageEditor
            onChange={() => {
              void load();
              setRevision((x) => x + 1);
            }}
          />
          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>{tx("Restaurant directory")}</h2>
                <p>
                  {tx(
                    "Changes apply immediately. Suspension pauses new guest sessions and orders; staff can finish existing tickets.",
                  )}
                </p>
              </div>
              <Building2 size={25} />
            </div>
            <div className="platform-filters">
              <label>
                <Search size={17} />
                <input
                  aria-label={tx("Search restaurants")}
                  placeholder={tx("Search by restaurant name or URL name")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                aria-label={tx("Filter by status")}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">{tx("All restaurants")}</option>
                <option value="active">{tx("Active")}</option>
                <option value="suspended">{tx("Suspended")}</option>
              </select>
            </div>
            <div className="platform-directory">
              {visible.map((r) => (
                <form
                  key={`${r.id}:${r.plan_id}:${r.active}`}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const active = f.get("active") === "active";
                    if (
                      r.active &&
                      !active &&
                      !window.confirm(
                        `${r.name}: ${tx("Suspend restaurant? New guest sessions and orders will be paused until reactivation.")}`,
                      )
                    )
                      return;
                    setBusy(r.id);
                    setError("");
                    setNotice("");
                    try {
                      await rpc("platform_update_restaurant", {
                        p_restaurant: r.id,
                        p_plan: String(f.get("plan")),
                        p_active: active,
                      });
                      await load();
                      setNotice(`${r.name}: ${tx("Updated.")}`);
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  <div className="platform-restaurant">
                    <span
                      className={`platform-status ${r.active ? "active" : ""}`}
                    >
                      {r.active ? tx("Active") : tx("Suspended")}
                    </span>
                    <h3>{r.name}</h3>
                    <small>{r.slug}</small>
                    {r.address && <p>{r.address}</p>}
                  </div>
                  <Field label={`${tx("Package")}: ${r.name}`}>
                    <select name="plan" defaultValue={r.plan_id}>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {tx(p.name)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`${tx("Access")}: ${r.name}`}>
                    <select
                      name="active"
                      defaultValue={r.active ? "active" : "suspended"}
                    >
                      <option value="active">{tx("Active")}</option>
                      <option value="suspended">{tx("Suspended")}</option>
                    </select>
                  </Field>
                  <Button disabled={!!busy}>
                    {busy === r.id ? tx("Saving…") : tx("Save changes")}
                  </Button>
                </form>
              ))}
            </div>
            {!visible.length && (
              <p className="platform-empty">
                {restaurants.length
                  ? tx("No restaurants match your filters.")
                  : tx("No restaurants have been created yet.")}
              </p>
            )}
          </section>
          <div className="platform-lower">
            <section className="panel">
              <h2>{tx("Package capacities")}</h2>
              <p>
                {tx(
                  "These limits are enforced per restaurant. Subscription billing is not enabled.",
                )}
              </p>
              {plans.map((p) => (
                <div className="platform-plan" key={p.id}>
                  <strong>{tx(p.name)}</strong>
                  <span>
                    {p.table_limit}
                    {tx("tables ·")}
                    {p.staff_limit}
                    {tx("staff ·")} {p.menu_limit}
                    {tx("menu items")}
                  </span>
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>{tx("Recent activity")}</h2>
              <p>{tx("The latest 30 recorded changes.")}</p>
              {audit.map((a) => (
                <div className="platform-audit" key={a.id}>
                  <strong>
                    {restaurants.find((r) => r.id === a.restaurant_id)?.name ??
                      "Restaurant"}
                  </strong>
                  <span>
                    {a.event.replaceAll(".", " · ").replaceAll("_", " ")}
                  </span>
                  <time>{new Date(a.created_at).toLocaleString(locale)}</time>
                </div>
              ))}
              {!audit.length && <p>{tx("No recorded changes yet.")}</p>}
            </section>
          </div>
        </main>
      )}
    </div>
  );
}
