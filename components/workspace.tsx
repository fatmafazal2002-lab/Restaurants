"use client";
import { translateText as tx } from "@/lib/translation";

import { PreferenceControls, usePreferences } from "./preferences";
import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowRight,
  Bell,
  BookOpen,
  Check,
  ChefHat,
  ChevronDown,
  ClipboardList,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  Leaf,
  Loader2,
  LogOut,
  Menu as MenuIcon,
  MessageSquare,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Table2,
  Users,
  Utensils,
} from "lucide-react";
import { Button } from "./ui/button";
import { en, de, tr, type TranslationKey } from "@/lib/i18n";
import { useWorkspace } from "@/lib/use-workspace";
import { rpc, supabase } from "@/lib/supabase";
import {
  RESTAURANT_SLUG_PATTERN,
  isRestaurantSlug,
} from "@/lib/restaurant-slug";
import { errorMessage, money } from "@/lib/utils";
import {
  canTransition,
  orderTotal,
  type MenuItem,
  type Order,
  type Status,
} from "@/lib/types";
import { PortalLogin } from "./portal-login";
import { RoleAvatar } from "./role-avatar";
import { RestaurantOnboarding } from "./restaurant-onboarding";
import { ToastBridge, useNotifications } from "./notifications";
import { ServiceProgress } from "./service-progress";
import { EmployeeSetup } from "./employee-setup";
import { ArchivedMenu } from "./archived-menu";
import { ProfileMenu } from "./profile-menu";
import { SignOutButton } from "./sign-out-button";
import { BrandingSettings } from "./branding-settings";
import { EmployeeManager } from "./employee-manager";
import { ResourceControls } from "./resource-controls";
import { StaffDirectory } from "./staff-directory";
import { brandingAttributes, brandingStyle } from "@/lib/branding";
import {
  canUsePortal,
  portalForRole,
  portalTitle,
  type Portal,
} from "@/lib/portals";
import { GuestView } from "./guest-view";
import { Empty, Field, Modal, type T } from "./shared";
import { Ticket } from "./ticket";
type Page =
  | "overview"
  | "menu"
  | "tables"
  | "kitchen"
  | "service"
  | "feedback"
  | "team"
  | "settings"
  | "platform";
export function Workspace({
  initialPortal,
  tenantSlug,
}: { initialPortal?: Portal; tenantSlug?: string } = {}) {
  const { locale, setLocale } = usePreferences();
  const w = useWorkspace(initialPortal, tenantSlug);
  const [page, setPage] = useState<Page>("overview"),
    [sidebar, setSidebar] = useState(false),
    [auth, setAuth] = useState(false),
    [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [actionError, setActionError] = useState(""),
    [modal, setModal] = useState<
      "item" | "category" | "table" | "staff" | null
    >(null),
    [editing, setEditing] = useState<MenuItem | null>(null),
    [filter, setFilter] = useState("all");
  const t: T = (key) => (locale === "tr" ? tr : locale === "de" ? de : en)[key];
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const { notify } = useNotifications();
  const run = async (fn: () => Promise<unknown>, message?: string) => {
    if (busy) return false;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      if (!w.online) throw new Error(t("offline"));
      await fn();
      await w.refresh();
      setNotice(message || t("success"));
      return true;
    } catch (e) {
      setActionError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const currentPortal = initialPortal ?? portalForRole(w.role);
  const admin =
    (w.role === "owner" || w.role === "admin") && currentPortal === "admin";
  const brand = w.restaurant ?? w.previewBrand;
  useEffect(() => {
    if (brand?.name) document.title = brand.name;
  }, [brand?.name]);
  useEffect(() => {
    if (
      w.user &&
      !w.user.is_anonymous &&
      w.restaurant &&
      w.role &&
      !w.guestToken &&
      !tenantSlug &&
      canUsePortal(w.role, currentPortal)
    )
      location.replace(
        `/r/${encodeURIComponent(w.restaurant.slug)}/${currentPortal}`,
      );
    else if (w.platformAdmin && !w.role && !w.guestToken && !w.loading)
      location.replace("/platform");
  }, [
    w.user,
    w.restaurant,
    w.role,
    w.guestToken,
    w.platformAdmin,
    w.loading,
    tenantSlug,
    currentPortal,
  ]);
  useEffect(() => {
    if (brand?.default_language && !localStorage.getItem("mise:language"))
      setLocale(brand.default_language);
  }, [brand?.default_language]);

  useEffect(() => {
    setPage(
      currentPortal === "kitchen"
        ? "kitchen"
        : currentPortal === "service"
          ? "service"
          : "overview",
    );
  }, [currentPortal]);
  const navigate = (next: Page) => {
    notify(t(next), "info");
    setPage(next);
    setSidebar(false);
    setFilter("all");
  };
  const safePage: Page =
    currentPortal === "kitchen"
      ? "kitchen"
      : currentPortal === "service"
        ? page === "tables"
          ? "tables"
          : "service"
        : page;
  const authSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(async () => {
      if (!supabase) throw new Error(t("setup"));
      const params = {
        email: String(f.get("email")),
        password: String(f.get("password")),
      };
      const { error } = register
        ? await supabase.auth.signUp(params)
        : await supabase.auth.signInWithPassword(params);
      if (error) throw error;
      setAuth(false);
      if (register) setNotice(t("registered"));
    });
  };
  const transition = (o: Order, next: Status) =>
    run(
      () =>
        rpc("transition_order", {
          p_order: o.id,
          p_expected: o.status,
          p_next: next,
        }),
      t("success"),
    );
  const submitModal = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = Object.fromEntries(f);
    let ok = false;
    if (modal === "category")
      ok = await run(
        () =>
          rpc("save_category", {
            p_restaurant: w.restaurantId,
            p_name: data.name,
          }),
        t("success"),
      );
    if (modal === "table")
      ok = await run(
        () =>
          rpc("create_table", {
            p_restaurant: w.restaurantId,
            p_name: data.name,
          }),
        t("success"),
      );
    if (modal === "staff")
      ok = await run(
        () =>
          rpc("add_staff", {
            p_restaurant: w.restaurantId,
            p_email: data.email,
            p_role: data.role,
          }),
        t("success"),
      );
    if (modal === "item")
      ok = await run(async () => {
        let imageUrl = String(data.image_url || "");
        const file = f.get("image") as File;
        if (file?.size) {
          if (!supabase) throw new Error(t("setup"));
          const path = `${w.restaurantId}/${crypto.randomUUID()}.${file.name.split(".").pop()}`;
          const { error } = await supabase.storage
            .from("restaurant-media")
            .upload(path, file);
          if (error) throw error;
          imageUrl = supabase.storage
            .from("restaurant-media")
            .getPublicUrl(path).data.publicUrl;
        }
        return rpc("save_menu_item", {
          p_restaurant: w.restaurantId,
          p_id: editing?.id ?? null,
          p_data: {
            ...data,
            price_cents: Math.round(Number(data.price) * 100),
            available: f.has("available"),
            ingredients: String(data.ingredients)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            allergens: String(data.allergens)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            image_url: imageUrl,
          },
        });
      }, t("success"));
    if (ok) setModal(null);
  };
  const active = w.orders.filter(
    (o) => !["served", "cancelled"].includes(o.status),
  );
  const queueOrders =
    filter === "served"
      ? w.orders.filter((o) => o.status === "served")
      : active;
  const stats = [
    {
      label: t("activeOrders"),
      value: String(active.length).padStart(2, "0"),
      icon: ClipboardList,
      note:
        locale === "de" ? "In Küche und Service" : tx("Across kitchen & floor"),
    },
    {
      label: t("readyOrders"),
      value: String(active.filter((o) => o.status === "ready").length).padStart(
        2,
        "0",
      ),
      icon: Bell,
      note:
        locale === "de"
          ? "Bereit für Ihre Gäste"
          : tx("A little happiness, ready to go"),
    },
    {
      label: t("sales"),
      value: money(
        w.orders
          .slice(0, 200)
          .filter((o) => o.status === "served")
          .reduce((s, o) => s + orderTotal(o), 0),
        w.restaurant?.currency,
        locale,
      ),
      icon: CreditCard,
      note:
        locale === "de"
          ? "Letzte 200 Bestellungen"
          : tx("Latest 200 tickets · excludes payments"),
    },
    {
      label: t("avgPrep"),
      value: (() => {
        const done = w.orders
          .slice(0, 200)
          .filter((o) => o.preparing_at && o.ready_at);
        return done.length
          ? `${Math.round(done.reduce((s, o) => s + (Date.parse(o.ready_at!) - Date.parse(o.preparing_at!)) / 60000, 0) / done.length)} ${t("minutes")}`
          : "—";
      })(),
      icon: ChefHat,
      note:
        locale === "de"
          ? "Zubereitungsstart bis fertig"
          : tx("From preparation to ready"),
    },
  ];
  const title = safePage === "overview" ? t("greeting") : t(safePage);
  const sub =
    safePage === "overview"
      ? t("overviewSub")
      : safePage === "platform"
        ? tx("Restaurants & subscription plans")
        : t(
            (
              {
                menu: "menuSub",
                tables: "tablesSub",
                kitchen: "kitchenSub",
                service: "serviceSub",
                feedback: "feedbackSub",
                team: "teamSub",
                settings: "settingsSub",
              } as const
            )[safePage],
          );
  const authModal = auth && (
    <Modal
      title={register ? t("register") : t("signIn")}
      close={() => setAuth(false)}
    >
      {w.user && !w.user.is_anonymous ? (
        <div className="account-panel">
          <p>{w.user.email}</p>
          <SignOutButton
            redirect={
              w.guestToken
                ? `/?table=${encodeURIComponent(w.guestToken)}`
                : `/login/${currentPortal}`
            }
          />
        </div>
      ) : (
        <form onSubmit={authSubmit}>
          <Field label={t("email")}>
            <input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label={t("password")}>
            <input
              name="password"
              type="password"
              minLength={8}
              autoComplete={register ? "new-password" : "current-password"}
              required
            />
          </Field>
          <Button disabled={busy || !supabase} type="submit">
            {busy ? (
              <Loader2 className="spin" />
            ) : register ? (
              t("register")
            ) : (
              t("signIn")
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRegister(!register)}
          >
            {register ? t("signIn") : t("register")}
          </Button>
          {actionError && (
            <p role="alert" className="error-text">
              {actionError}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
  if (w.employeeSetup)
    return <EmployeeSetup profile={w.employeeSetup} brand={brand} />;
  if (w.guestToken)
    return (
      <div
        className="themed"
        style={brandingStyle(brand)}
        {...brandingAttributes(brand)}
        data-theme={brand?.theme_mode ?? "light"}
        data-style={brand?.interface_style ?? "classic"}
      >
        <GuestView
          w={w}
          t={t}
          locale={locale}
          setLocale={setLocale}
          run={run}
          busy={busy}
          error={actionError}
          notice={notice}
          openAuth={() => setAuth(true)}
        />
        {authModal}
      </div>
    );
  if (!w.authReady || (w.user && w.loading && !w.restaurant && !w.error))
    return (
      <div className="portal-loading" role="status">
        <RoleAvatar role={currentPortal} size={90} />
        <p>{t("loading")}</p>
      </div>
    );
  if (!w.user || w.user.is_anonymous)
    return (
      <PortalLogin
        portal={currentPortal}
        brand={brand}
        locale={locale}
        setLocale={setLocale}
      />
    );
  if (
    w.user &&
    !w.restaurant &&
    !w.platformAdmin &&
    !tenantSlug &&
    !w.loading &&
    currentPortal === "admin" &&
    !w.error
  )
    return <RestaurantOnboarding />;
  if (
    (!w.role && currentPortal !== "admin") ||
    (w.role && !canUsePortal(w.role, currentPortal))
  )
    return (
      <main
        className="portal-login themed"
        data-theme={brand?.theme_mode || "light"}
        style={brandingStyle(brand)}
        {...brandingAttributes(brand)}
      >
        <section className="panel access-state">
          <RoleAvatar role={currentPortal} size={100} />
          <h1>
            {locale === "de"
              ? "Zugang zu Ihrem Team"
              : tx("Join your team workspace")}
          </h1>
          <p>
            {w.role
              ? locale === "de"
                ? "Dieses Konto hat eine andere Teamrolle."
                : tx("This account belongs to a different staff workspace.")
              : locale === "de"
                ? "Ein Administrator muss Ihre E-Mail-Adresse dem Restaurant und Ihrer Rolle zuweisen."
                : tx(
                    "An administrator needs to assign your email to the restaurant and your staff role.",
                  )}
          </p>
          <strong>{w.user.email}</strong>
          {w.role && (
            <Button asChild>
              <a href={`/${portalForRole(w.role)}`}>
                {portalTitle(portalForRole(w.role), locale === "de")}
                <ArrowRight size={16} />
              </a>
            </Button>
          )}
          <Button onClick={() => void w.refresh()}>{t("retry")}</Button>
          <SignOutButton
            redirect={`/login/${currentPortal}${w.restaurant?.slug ? `?restaurant=${encodeURIComponent(w.restaurant.slug)}` : ""}`}
            label={t("signOut")}
          />
          {w.error && <p role="alert">{w.error}</p>}
        </section>
      </main>
    );
  return (
    <div
      className="app-shell themed"
      data-theme={brand?.theme_mode || "light"}
      data-style={brand?.interface_style || "classic"}
      style={brandingStyle(brand)}
      {...brandingAttributes(brand)}
    >
      <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`}>
        <a className="wordmark" href="/">
          {brand?.logo_url ? (
            <img src={brand.logo_url} alt={brand.name} />
          ) : (
            <>
              {brand?.name || "mise"}
              <span>✳</span>
            </>
          )}
        </a>
        <p className="brand-caption">
          {portalTitle(currentPortal, locale === "de").toUpperCase()}
        </p>
        <div className="restaurant-switch">
          <span className="restaurant-symbol">
            {w.restaurant?.logo_url ? (
              <img src={w.restaurant.logo_url} alt="" width={24} height={24} />
            ) : (
              <Utensils size={19} />
            )}
          </span>
          <div>
            <strong>{w.restaurant?.name || tx("Your restaurant")}</strong>
            <span>{w.restaurant?.plan_id || tx("Your next chapter")}</span>
          </div>
          {w.restaurants.length > 1 ? (
            <select
              aria-label={tx("Choose restaurant")}
              value={w.restaurantId}
              onChange={(e) => {
                const next = w.restaurants.find((r) => r.id === e.target.value);
                if (next)
                  location.assign(
                    `/r/${encodeURIComponent(next.slug)}/${currentPortal}`,
                  );
              }}
            >
              {w.restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <ChevronDown size={15} />
          )}
        </div>
        <nav aria-label={tx("Main navigation")}>
          <p className="nav-label">{t("workspace")}</p>
          {(
            [
              { id: "overview", icon: LayoutDashboard },
              { id: "menu", icon: BookOpen },
              { id: "tables", icon: Table2 },
            ] as const
          )
            .filter(
              (n) =>
                currentPortal === "admin" ||
                (currentPortal === "service" && n.id === "tables"),
            )
            .map((n) => (
              <button
                key={n.id}
                className={`nav-item ${safePage === n.id ? "active" : ""}`}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={18} />
                {t(n.id)}
                {n.id === "overview" && <span className="nav-dot" />}
              </button>
            ))}
          <p className="nav-label">{t("operations")}</p>
          {(
            [
              { id: "kitchen", icon: ChefHat },
              { id: "service", icon: Bell },
            ] as const
          )
            .filter(
              (n) =>
                currentPortal === "admin" ||
                (currentPortal === "kitchen" && n.id === "kitchen") ||
                (currentPortal === "service" && n.id === "service"),
            )
            .map((n) => (
              <button
                key={n.id}
                className={`nav-item ${safePage === n.id ? "active" : ""}`}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={18} />
                {t(n.id)}
                {n.id === "kitchen" && active.length > 0 && (
                  <span className="nav-count">{active.length}</span>
                )}
              </button>
            ))}
          {currentPortal === "admin" && (
            <>
              <p className="nav-label">{t("restaurant")}</p>
              {(
                [
                  { id: "feedback", icon: MessageSquare },
                  { id: "team", icon: Users },
                  { id: "settings", icon: Settings2 },
                ] as const
              ).map((n) => (
                <button
                  key={n.id}
                  className={`nav-item ${safePage === n.id ? "active" : ""}`}
                  onClick={() => navigate(n.id)}
                >
                  <n.icon size={18} />
                  {t(n.id)}
                </button>
              ))}
            </>
          )}
          {w.platformAdmin && (
            <a className="nav-item" href="/platform">
              <ArrowRight size={18} />
              {t("platform")}
            </a>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="small-note">
            <Leaf size={21} />
            <p>
              {tx("Less busywork.")}
              <br />
              <strong>{tx("More hospitality.")}</strong>
            </p>
          </div>
          <div className="profile">
            <RoleAvatar role={currentPortal} size={38} />
            <span>
              <strong>{w.user?.email}</strong>
              <small>
                {tx(
                  w.role === "owner"
                    ? "Owner"
                    : w.role === "admin"
                      ? "Admin"
                      : w.role === "cook"
                        ? "Kitchen team"
                        : "Floor service",
                )}
              </small>
            </span>
          </div>
          <SignOutButton
            redirect={`/login/${currentPortal}${w.restaurant?.slug ? `?restaurant=${encodeURIComponent(w.restaurant.slug)}` : ""}`}
            label={t("signOut")}
          />
        </div>
      </aside>
      {sidebar && (
        <button
          aria-label={tx("Close navigation")}
          className="sidebar-overlay"
          onClick={() => setSidebar(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              className="mobile-menu"
              variant="ghost"
              size="icon"
              onClick={() => setSidebar(!sidebar)}
              aria-label={tx("Open navigation")}
            >
              <MenuIcon />
            </Button>
            <span>{w.restaurant?.name || tx("Restaurant workspace")}</span>
            <span>/</span>
            <strong>{t(safePage)}</strong>
          </div>
          <div className="topbar-actions">
            {w.user && w.restaurant && (
              <ProfileMenu
                restaurantId={w.restaurantId}
                userId={w.user.id}
                email={w.user.email || ""}
                portal={currentPortal}
                slug={w.restaurant.slug}
                onSettings={admin ? () => navigate("settings") : undefined}
              />
            )}
            <SignOutButton
              redirect={`/login/${currentPortal}${w.restaurant?.slug ? `?restaurant=${encodeURIComponent(w.restaurant.slug)}` : ""}`}
              label={t("signOut")}
            />
            <span
              className={`connection ${w.live && w.online ? "connected" : ""}`}
            >
              <i />
              {!supabase
                ? t("setup")
                : !w.user
                  ? t("signIn")
                  : !w.restaurantId
                    ? t("setup")
                    : !w.online
                      ? t("offline")
                      : w.live
                        ? t("live")
                        : t("connecting")}
            </span>
            <PreferenceControls />
            <Button
              variant="ghost"
              size="icon"
              aria-label={tx("Guest requests")}
              onClick={() => navigate("service")}
            >
              <Bell size={19} />
              {w.requests.length > 0 && <span className="notification-dot" />}
            </Button>
          </div>
        </header>
        <main>
          <motion.div
            className="role-welcome"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <RoleAvatar role={currentPortal} size={64} />
            <div>
              <span className="eyebrow">{brand?.name || "Mise"}</span>
              <strong>{portalTitle(currentPortal, locale === "de")}</strong>
            </div>
            <span className="role-welcome-note">
              {locale === "de"
                ? "Ein Team. Ein guter Service."
                : tx("One team. A better service.")}
            </span>
          </motion.div>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {safePage === "overview"
                  ? tx("THE ART OF A GOOD SERVICE")
                  : tx("MADE FOR HOSPITALITY")}
              </div>
              <h1>{title}</h1>
              <p>{sub}</p>
            </div>
            {safePage === "overview" ? (
              <Button
                variant="outline"
                onClick={() =>
                  navigate(w.role === "waiter" ? "service" : "kitchen")
                }
              >
                <ChefHat size={17} />
                {t("viewKitchen")}
                <ArrowRight size={16} />
              </Button>
            ) : safePage === "menu" && admin ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setModal("item");
                }}
              >
                <Plus size={17} />
                {t("addItem")}
              </Button>
            ) : safePage === "tables" && admin ? (
              <Button onClick={() => setModal("table")}>
                <Plus size={17} />
                {t("addTable")}
              </Button>
            ) : null}
          </div>
          {(!supabase || !w.user) && (
            <div className="setup-banner">
              <div className="setup-icon">
                <Sparkles size={22} />
              </div>
              <div>
                <strong>{t("connect")}</strong>
                <p>
                  {!supabase
                    ? t("setupText")
                    : locale === "de"
                      ? "Melden Sie sich an, um Ihr Restaurant einzurichten."
                      : tx(
                          "Sign in to set up your restaurant and welcome your first guests.",
                        )}
                </p>
                {!supabase && <small>{t("setupStep")}</small>}
              </div>
              <Button
                variant="outline"
                disabled={!supabase}
                onClick={() => setAuth(true)}
              >
                {t("signIn")}
                <ArrowRight size={16} />
              </Button>
            </div>
          )}
          {(w.error || actionError) && (
            <div className="error-banner" role="alert">
              <span>{w.error || actionError}</span>
              <Button
                variant="ghost"
                onClick={() => {
                  setActionError("");
                  void w.refresh();
                }}
              >
                {t("retry")}
              </Button>
            </div>
          )}
          {w.loading && (
            <div className="loading-line" aria-label={t("loading")} />
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={safePage}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {safePage === "overview" && (
                <>
                  <div className="stats-grid">
                    {stats.map((s, i) => (
                      <section className="stat-card" key={s.label}>
                        <div className="stat-top">
                          <span>{s.label}</span>
                          <s.icon size={19} />
                        </div>
                        <strong className={i === 1 ? "sage-text" : ""}>
                          {s.value}
                        </strong>
                        <small>{s.note}</small>
                      </section>
                    ))}
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <h2>{t("recent")}</h2>
                          <p>{t("recentSub")}</p>
                        </div>
                        <span className="label-pill">
                          {active.length} {t("activeOrders").toLowerCase()}
                        </span>
                      </div>
                      {w.orders.length ? (
                        <div className="order-list">
                          {w.orders.slice(0, 8).map((o) => (
                            <div className="order-row" key={o.id}>
                              <span className="table-icon">
                                <Table2 size={19} />
                              </span>
                              <div>
                                <strong>{o.table_name}</strong>
                                <small>
                                  #{o.id.slice(0, 6)} ·{" "}
                                  {new Date(o.created_at).toLocaleTimeString(
                                    locale,
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </small>
                              </div>
                              <span className={`status ${o.status}`}>
                                {t(o.status)}
                              </span>
                              <strong>
                                {money(
                                  orderTotal(o),
                                  w.restaurant?.currency,
                                  locale,
                                )}
                              </strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty title={t("noOrders")} body={t("noOrdersText")}>
                          <Button
                            variant="outline"
                            onClick={() => navigate("menu")}
                          >
                            {t("manageMenu")}
                            <ArrowRight size={16} />
                          </Button>
                        </Empty>
                      )}
                    </section>
                    <aside className="hospitality-card">
                      <div className="line-art">
                        <div className="plate">
                          <Leaf size={42} strokeWidth={1} />
                        </div>
                        <div className="fork-line" />
                        <div className="glass-line" />
                      </div>
                      <span className="eyebrow">
                        {tx("A THOUGHTFUL LITTLE REMINDER")}
                      </span>
                      <h2>
                        {tx("Great service starts")}
                        <br />
                        {tx("with a little space.")}
                      </h2>
                      <p>
                        {tx(
                          "Keep your menu fresh, your kitchen in sync, and your attention on your guests.",
                        )}
                      </p>
                      <button onClick={() => navigate("menu")}>
                        {tx("Make room for a good service")}{" "}
                        <ArrowDownRight size={19} />
                      </button>
                    </aside>
                  </div>
                  <div className="bottom-links">
                    {[
                      {
                        icon: BookOpen,
                        label: t("menu"),
                        value: `${w.menu.filter((i) => i.available).length} ${tx("available items")}`,
                        page: "menu",
                      },
                      {
                        icon: Table2,
                        label: t("tables"),
                        value: `${w.tables.length} ${tx("tables in your space")}`,
                        page: "tables",
                      },
                      {
                        icon: MessageSquare,
                        label: t("feedback"),
                        value: `${w.feedback.length} ${tx("guest reflections")}`,
                        page: "feedback",
                      },
                    ].map((x) => (
                      <button
                        key={x.page}
                        onClick={() => navigate(x.page as Page)}
                      >
                        <x.icon size={22} />
                        <span>
                          <strong>{x.label}</strong>
                          <small>{x.value}</small>
                        </span>
                        <ArrowRight size={18} />
                      </button>
                    ))}
                  </div>
                </>
              )}
              {["overview", "kitchen", "service"].includes(safePage) && (
                <ServiceProgress
                  orders={w.orders}
                  chart={safePage === "overview"}
                  onStage={(status) => {
                    if (admin) {
                      setPage("kitchen");
                      setFilter(status);
                    } else setFilter(status);
                    notify(
                      tx(
                        status === "placed"
                          ? "Placed"
                          : status === "preparing"
                            ? "Preparing"
                            : status === "ready"
                              ? "Ready"
                              : "Served",
                      ),
                      "info",
                    );
                  }}
                />
              )}
              {safePage === "menu" && admin && (
                <ArchivedMenu
                  restaurantId={w.restaurantId}
                  revision={JSON.stringify(w.menu)}
                  run={run}
                />
              )}
              {safePage === "menu" && (
                <section className="panel">
                  <div className="section-heading">
                    <div className="tabs">
                      <button
                        className={filter === "all" ? "selected" : ""}
                        onClick={() => setFilter("all")}
                      >
                        {t("all")} <span>{w.menu.length}</span>
                      </button>
                      {w.categories.map((c) => (
                        <button
                          className={filter === c.id ? "selected" : ""}
                          key={c.id}
                          onClick={() => setFilter(c.id)}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                    {admin && (
                      <Button
                        variant="ghost"
                        onClick={() => setModal("category")}
                      >
                        <Plus size={16} />
                        {t("addCategory")}
                      </Button>
                    )}
                  </div>
                  {admin && w.categories.length > 0 && (
                    <details className="panel category-management">
                      <summary>{tx("Edit or delete categories")}</summary>
                      {w.categories.map((c) => (
                        <div className="order-row" key={c.id}>
                          <strong>{c.name}</strong>
                          <ResourceControls
                            restaurantId={w.restaurantId}
                            id={c.id}
                            name={c.name}
                            kind="category"
                            run={run}
                          />
                        </div>
                      ))}
                    </details>
                  )}
                  {w.menu.length ? (
                    <div className="menu-grid">
                      {w.menu
                        .filter(
                          (i) => filter === "all" || i.category_id === filter,
                        )
                        .map((item) => (
                          <article className="menu-card" key={item.id}>
                            <div className="dish-image">
                              {item.image_url ? (
                                <img src={item.image_url} alt={item.name} />
                              ) : (
                                <Utensils size={32} strokeWidth={1} />
                              )}
                              <span
                                className={`availability ${item.available ? "" : "unavailable"}`}
                              >
                                {item.available
                                  ? t("available")
                                  : tx("Unavailable")}
                              </span>
                            </div>
                            <div className="dish-body">
                              <div className="section-heading">
                                <h3>{item.name}</h3>
                                <strong>
                                  {money(
                                    item.price_cents,
                                    w.restaurant?.currency,
                                    locale,
                                  )}
                                </strong>
                              </div>
                              <p>{item.description || "—"}</p>
                              {item.allergens.length > 0 && (
                                <small>
                                  {tx("Allergens:")}
                                  {item.allergens.join(", ")}
                                </small>
                              )}
                              {admin && (
                                <ResourceControls
                                  restaurantId={w.restaurantId}
                                  id={item.id}
                                  name={item.name}
                                  kind="menu"
                                  run={run}
                                />
                              )}
                              {admin && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setEditing(item);
                                    setModal("item");
                                  }}
                                >
                                  {t("edit")}
                                </Button>
                              )}
                            </div>
                          </article>
                        ))}
                    </div>
                  ) : (
                    <Empty
                      title={t("noMenu")}
                      body={t("noMenuText")}
                      icon={<BookOpen size={28} />}
                    >
                      {admin && (
                        <Button
                          onClick={() => {
                            setEditing(null);
                            setModal("item");
                          }}
                        >
                          <Plus size={16} />
                          {t("addItem")}
                        </Button>
                      )}
                    </Empty>
                  )}
                </section>
              )}
              {safePage === "tables" && (
                <div className="tables-grid">
                  {w.tables.length ? (
                    w.tables.map((table) => (
                      <section className="panel table-card" key={table.id}>
                        <div className="table-top">
                          <Table2 size={24} />
                          <span className="label-pill">
                            {
                              active.filter((o) => o.table_name === table.name)
                                .length
                            }{" "}
                            {tx("active")}
                          </span>
                        </div>
                        <h2>{table.name}</h2>
                        {admin && (
                          <ResourceControls
                            restaurantId={w.restaurantId}
                            id={table.id}
                            name={table.name}
                            kind="table"
                            removed={!table.active}
                            run={run}
                          />
                        )}
                        <p>
                          {table.active
                            ? tx("Open for guests")
                            : tx("Ordering paused")}
                        </p>
                        <Button
                          variant="outline"
                          onClick={() =>
                            void run(async () => {
                              await navigator.clipboard.writeText(
                                `${location.origin}/?table=${table.access_token}`,
                              );
                            }, t("copied"))
                          }
                        >
                          {t("copyLink")}
                          <ExternalLink size={15} />
                        </Button>
                      </section>
                    ))
                  ) : (
                    <section className="panel full-width">
                      <Empty title={t("empty")} icon={<Table2 size={28} />} />
                    </section>
                  )}
                </div>
              )}
              {(safePage === "kitchen" || safePage === "service") && (
                <>
                  <div className="tabs queue-tabs">
                    {["all", "placed", "preparing", "ready", "served"].map(
                      (s) => (
                        <button
                          className={filter === s ? "selected" : ""}
                          key={s}
                          onClick={() => setFilter(s)}
                        >
                          {t(s as TranslationKey)}
                          <span>
                            {s === "all"
                              ? active.length
                              : w.orders.filter((o) => o.status === s).length}
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                  {safePage === "service" && w.requests.length > 0 && (
                    <section className="panel request-panel">
                      <h2>{t("requests")}</h2>
                      {w.requests.map((r) => (
                        <div className="order-row" key={r.id}>
                          <Bell size={19} />
                          <strong>{r.table_name}</strong>
                          <span>{r.message}</span>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                rpc("resolve_request", { p_request: r.id }),
                              )
                            }
                          >
                            {t("resolve")}
                          </Button>
                        </div>
                      ))}
                    </section>
                  )}
                  <div className="ticket-grid">
                    {queueOrders
                      .filter((o) => filter === "all" || o.status === filter)
                      .map((o) => (
                        <Ticket
                          key={o.id}
                          order={o}
                          t={t}
                          locale={locale}
                          action={(next) => void transition(o, next)}
                          canAct={(next) =>
                            canTransition(w.role, o.status, next)
                          }
                          busy={busy}
                        />
                      ))}
                    {queueOrders.filter(
                      (o) => filter === "all" || o.status === filter,
                    ).length === 0 && (
                      <section className="panel full-width">
                        <Empty
                          title={t("noOrders")}
                          body={t("noOrdersText")}
                          icon={<ChefHat size={30} />}
                        />
                      </section>
                    )}
                  </div>
                </>
              )}
              {safePage === "feedback" && (
                <section className="panel">
                  {w.feedback.length ? (
                    w.feedback.map((f) => (
                      <article className="feedback-row" key={f.id}>
                        <span className="stars">
                          {"★".repeat(f.rating)}
                          {"☆".repeat(5 - f.rating)}
                        </span>
                        <span className="label-pill">
                          <Check size={12} />
                          {tx("Verified order")}
                        </span>
                        <p>{f.comment || "—"}</p>
                        <small>
                          {new Date(f.created_at).toLocaleDateString(locale)}
                        </small>
                      </article>
                    ))
                  ) : (
                    <Empty
                      title={t("empty")}
                      icon={<MessageSquare size={28} />}
                    />
                  )}
                </section>
              )}
              {safePage === "team" && w.restaurant && admin && (
                <EmployeeManager
                  restaurantId={w.restaurantId}
                  slug={w.restaurant.slug}
                  owner={w.role === "owner"}
                  onChanged={() => void w.refresh()}
                />
              )}
              {safePage === "settings" && w.restaurant && admin && (
                <BrandingSettings
                  key={w.restaurantId}
                  restaurant={w.restaurant}
                  run={run}
                  busy={busy}
                  t={t}
                  locale={locale}
                />
              )}
              {safePage === "platform" && w.platformAdmin && (
                <section className="panel">
                  {w.restaurants.map((r) => (
                    <form
                      className="order-row"
                      key={r.id}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void run(
                          () =>
                            rpc("platform_update_restaurant", {
                              p_restaurant: r.id,
                              p_plan: f.get("plan"),
                              p_active: f.has("active"),
                            }),
                          t("success"),
                        );
                      }}
                    >
                      <strong>{r.name}</strong>
                      <select name="plan" defaultValue={r.plan_id}>
                        <option value="starter">{tx("Starter")}</option>
                        <option value="growth">{tx("Growth")}</option>
                        <option value="enterprise">{tx("Enterprise")}</option>
                      </select>
                      <label>
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={r.active}
                        />{" "}
                        {tx("Active")}
                      </label>
                      <Button disabled={busy}>{t("save")}</Button>
                    </form>
                  ))}
                </section>
              )}
            </motion.div>
          </AnimatePresence>
          <footer>
            <span>
              {w.restaurant?.name}
              <span className="footer-star">✳</span>
            </span>
            <p>{tx("Thoughtfully made for the people behind the plate.")}</p>
            <span className="footer-secure">
              <ShieldCheck size={14} />
              {tx("Your restaurant. Your space.")}
            </span>
          </footer>
        </main>
      </div>
      <ToastBridge message={notice} />
      <ToastBridge message={actionError || w.error} kind="error" />
      {authModal}
      {modal && (
        <Modal
          title={t(
            modal === "item"
              ? editing
                ? "edit"
                : "addItem"
              : modal === "category"
                ? "addCategory"
                : modal === "table"
                  ? "addTable"
                  : "addStaff",
          )}
          close={() => setModal(null)}
        >
          <form onSubmit={submitModal}>
            {modal === "staff" ? (
              <>
                <Field label={t("staffEmail")}>
                  <input type="email" name="email" required />
                </Field>
                <Field label={t("role")}>
                  <select name="role">
                    <option value="waiter">
                      {portalTitle("service", locale === "de")}
                    </option>
                    <option value="cook">
                      {portalTitle("kitchen", locale === "de")}
                    </option>
                    {w.role === "owner" && (
                      <option value="admin">{tx("Admin")}</option>
                    )}
                  </select>
                </Field>
              </>
            ) : (
              <Field label={t("name")}>
                <input
                  name="name"
                  required
                  maxLength={
                    modal === "table" ? 40 : modal === "category" ? 80 : 120
                  }
                  defaultValue={editing?.name || ""}
                />
              </Field>
            )}
            {modal === "item" && (
              <>
                <Field label={t("description")}>
                  <textarea
                    name="description"
                    maxLength={2000}
                    defaultValue={editing?.description || ""}
                  />
                </Field>
                <div className="form-grid">
                  <Field
                    label={`${t("price")} (${w.restaurant?.currency || "EUR"})`}
                  >
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="10000"
                      name="price"
                      required
                      defaultValue={editing ? editing.price_cents / 100 : ""}
                    />
                  </Field>
                  <Field label={t("category")}>
                    <select
                      name="category_id"
                      defaultValue={editing?.category_id || ""}
                    >
                      <option value="">—</option>
                      {w.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label={tx("Ingredients (comma separated)")}>
                  <input
                    name="ingredients"
                    defaultValue={editing?.ingredients.join(", ") || ""}
                  />
                </Field>
                <Field label={tx("Allergens (comma separated)")}>
                  <input
                    name="allergens"
                    defaultValue={editing?.allergens.join(", ") || ""}
                  />
                </Field>
                <Field label={tx("Image URL")}>
                  <input
                    name="image_url"
                    type="url"
                    defaultValue={editing?.image_url || ""}
                  />
                </Field>
                <Field label={tx("Or upload an image (up to 10 MB)")}>
                  <input
                    name="image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={(e) => {
                    for (const name of ["image_url", "image"]) {
                      const input = e.currentTarget.form?.elements.namedItem(
                        name,
                      ) as HTMLInputElement | null;
                      if (input) input.value = "";
                    }
                  }}
                >
                  {tx("Remove image")}
                </Button>
                <Field label={tx("Video URL")}>
                  <input
                    name="video_url"
                    type="url"
                    defaultValue={editing?.video_url || ""}
                  />
                </Field>
                <label className="checkbox">
                  <input
                    name="available"
                    type="checkbox"
                    defaultChecked={editing?.available ?? true}
                  />
                  {t("available")}
                </label>
              </>
            )}
            <div className="form-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModal(null)}
              >
                {t("cancel")}
              </Button>
              <Button disabled={busy}>
                {busy ? <Loader2 className="spin" size={17} /> : t("save")}
              </Button>
            </div>
            {actionError && (
              <p role="alert" className="error-text">
                {actionError}
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
