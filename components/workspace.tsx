"use client";
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
import { en, de, type TranslationKey } from "@/lib/i18n";
import { useWorkspace } from "@/lib/use-workspace";
import { rpc, supabase } from "@/lib/supabase";
import { errorMessage, money } from "@/lib/utils";
import {
  canTransition,
  orderTotal,
  type MenuItem,
  type Order,
  type Status,
} from "@/lib/types";
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
export function Workspace() {
  const w = useWorkspace();
  const [page, setPage] = useState<Page>("overview"),
    [locale, setLocale] = useState<"en" | "de">("en"),
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
  const t: T = (key) => (locale === "de" ? de : en)[key];
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const run = async (fn: () => Promise<unknown>, message?: string) => {
    if (busy) return false;
    setBusy(true);
    setActionError("");
    try {
      if (!w.online) throw new Error(t("offline"));
      await fn();
      await w.refresh();
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setActionError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const admin = w.role === "owner" || w.role === "admin";
  const navigate = (next: Page) => {
    setPage(next);
    setSidebar(false);
    setFilter("all");
  };
  const safePage: Page =
    w.role === "cook" && !["overview", "kitchen"].includes(page)
      ? "kitchen"
      : w.role === "waiter" && !["overview", "service", "tables"].includes(page)
        ? "service"
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
    run(() =>
      rpc("transition_order", {
        p_order: o.id,
        p_expected: o.status,
        p_next: next,
      }),
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
  const stats = [
    {
      label: t("activeOrders"),
      value: String(active.length).padStart(2, "0"),
      icon: ClipboardList,
      note: locale === "de" ? "In Küche und Service" : "Across kitchen & floor",
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
          : "A little happiness, ready to go",
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
          : "Latest 200 tickets · excludes payments",
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
          : "From preparation to ready",
    },
  ];
  const title = safePage === "overview" ? t("greeting") : t(safePage);
  const sub =
    safePage === "overview"
      ? t("overviewSub")
      : safePage === "platform"
        ? "Restaurants & subscription plans"
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
    </Modal>
  );
  if (w.guestToken)
    return (
      <>
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
      </>
    );
  return (
    <div
      className="app-shell"
      style={
        {
          "--brand": w.restaurant?.brand_color || "#53634b",
        } as React.CSSProperties
      }
    >
      <aside className={`sidebar ${sidebar ? "sidebar-open" : ""}`}>
        <a className="wordmark" href="/">
          mise<span>✳</span>
        </a>
        <p className="brand-caption">A BETTER SERVICE</p>
        <div className="restaurant-switch">
          <span className="restaurant-symbol">
            {w.restaurant?.logo_url ? (
              <img src={w.restaurant.logo_url} alt="" width={24} height={24} />
            ) : (
              <Utensils size={19} />
            )}
          </span>
          <div>
            <strong>{w.restaurant?.name || "Your restaurant"}</strong>
            <span>{w.restaurant?.plan_id || "Your next chapter"}</span>
          </div>
          {w.restaurants.length > 1 ? (
            <select
              aria-label="Choose restaurant"
              value={w.restaurantId}
              onChange={(e) => w.setRestaurantId(e.target.value)}
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
        <nav aria-label="Main navigation">
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
                !w.role ||
                admin ||
                n.id === "overview" ||
                (w.role === "waiter" && n.id === "tables"),
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
                !w.role ||
                admin ||
                (w.role === "cook" && n.id === "kitchen") ||
                (w.role === "waiter" && n.id === "service"),
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
          {(!w.role || admin) && (
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
            <button
              className={`nav-item ${page === "platform" ? "active" : ""}`}
              onClick={() => navigate("platform")}
            >
              <ShieldCheck size={18} />
              {t("platform")}
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="small-note">
            <Leaf size={21} />
            <p>
              Less busywork.
              <br />
              <strong>More hospitality.</strong>
            </p>
          </div>
          <button
            className="profile"
            onClick={() =>
              w.user
                ? void run(async () => {
                    await supabase?.auth.signOut();
                  })
                : setAuth(true)
            }
          >
            <span className="avatar">
              {w.user?.email?.slice(0, 2).toUpperCase() || "M"}
            </span>
            <span>
              <strong>{w.user?.email?.split("@")[0] || t("account")}</strong>
              <small>{w.role || t("signIn")}</small>
            </span>
            {w.user ? <LogOut size={16} /> : <ArrowRight size={16} />}
          </button>
        </div>
      </aside>
      {sidebar && (
        <button
          aria-label="Close navigation"
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
              aria-label="Open navigation"
            >
              <MenuIcon />
            </Button>
            <span>{w.restaurant?.name || "Restaurant workspace"}</span>
            <span>/</span>
            <strong>{t(safePage)}</strong>
          </div>
          <div className="topbar-actions">
            <span
              className={`connection ${w.live && w.online ? "connected" : ""}`}
            >
              <i />
              {!supabase
                ? t("setup")
                : !w.online
                  ? t("offline")
                  : w.live
                    ? t("live")
                    : t("connecting")}
            </span>
            <select
              className="language"
              aria-label="Language"
              value={locale}
              onChange={(e) => setLocale(e.target.value as "en" | "de")}
            >
              <option value="en">EN</option>
              <option value="de">DE</option>
            </select>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Guest requests"
              onClick={() => navigate("service")}
            >
              <Bell size={19} />
              {w.requests.length > 0 && <span className="notification-dot" />}
            </Button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {safePage === "overview"
                  ? "THE ART OF A GOOD SERVICE"
                  : "MADE FOR HOSPITALITY"}
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
            ) : safePage === "team" && w.role === "owner" ? (
              <Button onClick={() => setModal("staff")}>
                <Plus size={17} />
                {t("addStaff")}
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
                      : "Sign in to set up your restaurant and welcome your first guests."}
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
          {w.user && !w.restaurant && !w.loading && !w.guestToken && (
            <section className="panel onboarding">
              <h2>{t("createRestaurant")}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(
                    () =>
                      rpc("create_restaurant", {
                        p_name: f.get("name"),
                        p_slug: f.get("slug"),
                      }),
                    t("success"),
                  );
                }}
              >
                <Field label={t("name")}>
                  <input name="name" required minLength={2} maxLength={100} />
                </Field>
                <Field label={t("slug")}>
                  <input
                    name="slug"
                    required
                    pattern="[a-z0-9][a-z0-9-]{2,60}"
                    placeholder="your-restaurant"
                  />
                </Field>
                <Button disabled={busy}>{t("createRestaurant")}</Button>
              </form>
            </section>
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
                        A THOUGHTFUL LITTLE REMINDER
                      </span>
                      <h2>
                        Great service starts
                        <br />
                        with a little space.
                      </h2>
                      <p>
                        Keep your menu fresh, your kitchen in sync, and your
                        attention on your guests.
                      </p>
                      <button onClick={() => navigate("menu")}>
                        Make room for a good service{" "}
                        <ArrowDownRight size={19} />
                      </button>
                    </aside>
                  </div>
                  <div className="bottom-links">
                    {[
                      {
                        icon: BookOpen,
                        label: t("menu"),
                        value: `${w.menu.filter((i) => i.available).length} available items`,
                        page: "menu",
                      },
                      {
                        icon: Table2,
                        label: t("tables"),
                        value: `${w.tables.length} tables in your space`,
                        page: "tables",
                      },
                      {
                        icon: MessageSquare,
                        label: t("feedback"),
                        value: `${w.feedback.length} guest reflections`,
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
                                  : "Unavailable"}
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
                                  Allergens: {item.allergens.join(", ")}
                                </small>
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
                            active
                          </span>
                        </div>
                        <h2>{table.name}</h2>
                        <p>
                          {table.active ? "Open for guests" : "Ordering paused"}
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
                    {["all", "placed", "preparing", "ready"].map((s) => (
                      <button
                        className={filter === s ? "selected" : ""}
                        key={s}
                        onClick={() => setFilter(s)}
                      >
                        {t(s as TranslationKey)}
                        <span>
                          {s === "all"
                            ? active.length
                            : active.filter((o) => o.status === s).length}
                        </span>
                      </button>
                    ))}
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
                    {active
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
                    {active.filter(
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
                          <Check size={12} /> Verified order
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
              {safePage === "team" && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>{t("team")}</h2>
                    <span className="label-pill">
                      {
                        w.memberships.filter(
                          (m) => m.restaurant_id === w.restaurantId,
                        ).length
                      }{" "}
                      members
                    </span>
                  </div>
                  {w.memberships
                    .filter((m) => m.restaurant_id === w.restaurantId)
                    .map((m) => (
                      <div className="order-row" key={m.user_id}>
                        <span className="avatar">
                          {m.role.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <strong>
                            {m.user_id === w.user?.id
                              ? w.user.email
                              : m.user_id}
                          </strong>
                          <small>{m.role}</small>
                        </div>
                      </div>
                    ))}
                </section>
              )}
              {safePage === "settings" && w.restaurant && (
                <section className="panel settings-panel">
                  <form
                    key={w.restaurantId}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = Object.fromEntries(
                        new FormData(e.currentTarget),
                      );
                      void run(
                        () =>
                          rpc("save_restaurant", {
                            p_restaurant: w.restaurantId,
                            p_data: data,
                          }),
                        t("success"),
                      );
                    }}
                  >
                    <h2>Restaurant profile</h2>
                    <Field label={t("name")}>
                      <input
                        name="name"
                        required
                        minLength={2}
                        maxLength={100}
                        defaultValue={w.restaurant.name}
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label={t("brandColor")}>
                        <input
                          type="color"
                          name="brand_color"
                          defaultValue={w.restaurant.brand_color}
                        />
                      </Field>
                      <Field label="Logo URL">
                        <input
                          name="logo_url"
                          type="url"
                          defaultValue={w.restaurant.logo_url || ""}
                        />
                      </Field>
                    </div>
                    <Field label={t("address")}>
                      <input
                        name="address"
                        defaultValue={w.restaurant.address}
                      />
                    </Field>
                    <Field label={t("contact")}>
                      <input
                        name="contact"
                        defaultValue={w.restaurant.contact}
                      />
                    </Field>
                    <Field label={t("hours")}>
                      <textarea
                        name="opening_hours"
                        defaultValue={w.restaurant.opening_hours}
                      />
                    </Field>
                    <Button disabled={busy || !admin}>{t("save")}</Button>
                  </form>
                </section>
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
                        <option value="starter">Starter</option>
                        <option value="growth">Growth</option>
                      </select>
                      <label>
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={r.active}
                        />{" "}
                        Active
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
              mise<span className="footer-star">✳</span>
            </span>
            <p>Thoughtfully made for the people behind the plate.</p>
            <span className="footer-secure">
              <ShieldCheck size={14} /> Your restaurant. Your space.
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
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
                    <option value="waiter">Waiter</option>
                    <option value="cook">Cook</option>
                    <option value="admin">Admin</option>
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
                <Field label="Ingredients (comma separated)">
                  <input
                    name="ingredients"
                    defaultValue={editing?.ingredients.join(", ") || ""}
                  />
                </Field>
                <Field label="Allergens (comma separated)">
                  <input
                    name="allergens"
                    defaultValue={editing?.allergens.join(", ") || ""}
                  />
                </Field>
                <Field label="Image URL">
                  <input
                    name="image_url"
                    type="url"
                    defaultValue={editing?.image_url || ""}
                  />
                </Field>
                <Field label="Or upload an image (up to 10 MB)">
                  <input
                    name="image"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                  />
                </Field>
                <Field label="Video URL">
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
