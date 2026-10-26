"use client";
import { ToastBridge, useNotifications } from "./notifications";
import { translateText as tx } from "@/lib/translation";

import { PreferenceControls, usePreferences } from "./preferences";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  ChefHat,
  Leaf,
  Minus,
  Plus,
  ShoppingBag,
  Utensils,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { brandingAttributes, brandingStyle } from "@/lib/branding";
import { RoleAvatar } from "./role-avatar";
import { Button } from "./ui/button";
import { Empty, Field, Modal, type T } from "./shared";
import { Ticket } from "./ticket";
import { rpc, supabase } from "@/lib/supabase";
import type { WorkspaceData } from "@/lib/use-workspace";
import type { CartItem, Order, OrderItem } from "@/lib/types";
import { money } from "@/lib/utils";
type Pending = { key: string; items: CartItem[] };
export function GuestView({
  w,
  t,
  locale,
  setLocale,
  run,
  busy,
  error,
  notice,
  openAuth,
}: {
  w: WorkspaceData;
  t: T;
  locale: "en" | "de" | "tr";
  setLocale: (l: "en" | "de" | "tr") => void;
  run: (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
  busy: boolean;
  error: string;
  notice: string;
  openAuth: () => void;
}) {
  usePreferences();
  const { notify } = useNotifications();

  const [cart, setCart] = useState<CartItem[]>([]),
    [pending, setPending] = useState<Pending | null>(null),
    [loaded, setLoaded] = useState(""),
    [category, setCategory] = useState("all"),
    [edit, setEdit] = useState<OrderItem | null>(null),
    [ratingOrder, setRatingOrder] = useState<Order | null>(null),
    [tab, setTab] = useState<"menu" | "orders">("menu");
  const reducedMotion = useReducedMotion();
  const [dragging, setDragging] = useState(false),
    [overDrop, setOverDrop] = useState(false);
  const dropTarget = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const brand = w.restaurant ?? w.previewBrand;
  useEffect(() => {
    if (!w.sessionId) return;
    try {
      const stored = localStorage.getItem(`mise:cart:${w.sessionId}`);
      const value = stored ? JSON.parse(stored) : {};
      setCart(value.cart || []);
      setPending(value.pending || null);
    } catch {
      setCart([]);
      setPending(null);
    }
    setLoaded(w.sessionId);
  }, [w.sessionId]);
  useEffect(() => {
    if (w.sessionId && loaded === w.sessionId)
      localStorage.setItem(
        `mise:cart:${w.sessionId}`,
        JSON.stringify({ cart, pending }),
      );
  }, [cart, pending, w.sessionId, loaded]);
  const add = (id: string) => {
    if (pending) return;
    notify(tx("Added to your order"));
    setCart((c) => {
      const found = c.find((i) => i.menu_item_id === id);
      return found
        ? c.map((i) =>
            i.menu_item_id === id
              ? { ...i, quantity: Math.min(20, i.quantity + 1) }
              : i,
          )
        : [...c, { menu_item_id: id, quantity: 1, instructions: "" }];
    });
  };
  const send = async () => {
    if (sending.current || busy) return;
    sending.current = true;
    const intent = pending ?? { key: crypto.randomUUID(), items: cart };
    setPending(intent);
    localStorage.setItem(
      `mise:cart:${w.sessionId}`,
      JSON.stringify({ cart, pending: intent }),
    );
    const ok = await run(async () => {
      try {
        return await rpc("place_order", {
          p_session: w.sessionId,
          p_key: intent.key,
          p_items: intent.items,
        });
      } catch (e) {
        if (
          e &&
          typeof e === "object" &&
          "code" in e &&
          /^[0-9A-Z]{5}$/.test(String(e.code))
        ) {
          setPending(null);
        }
        throw e;
      }
    });
    if (ok) {
      setCart([]);
      setPending(null);
      setTab("orders");
      notify(tx("Order sent to the kitchen"));
    }
    sending.current = false;
  };
  const total = cart.reduce(
    (s, c) =>
      s +
      (w.menu.find((i) => i.id === c.menu_item_id)?.price_cents ?? 0) *
        c.quantity,
    0,
  );
  return (
    <div
      className="guest-shell themed"
      data-theme={brand?.theme_mode || "light"}
      data-style={brand?.interface_style || "classic"}
      data-menu-layout={brand?.menu_layout || "grid"}
      style={brandingStyle(brand)}
      {...brandingAttributes(brand)}
    >
      <header className="guest-header">
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
        <span>{brand?.name || t("welcome")}</span>
        <div>
          <PreferenceControls />
          <Button variant="ghost" onClick={openAuth}>
            {t("account")}
          </Button>
        </div>
      </header>
      <main className="guest-main">
        {brand?.cover_url && (
          <img className="guest-cover" src={brand.cover_url} alt="" />
        )}
        <div className="guest-hero">
          <RoleAvatar role="guest" size={82} />
          <div className="eyebrow">{tx("GOOD FOOD. GOOD COMPANY.")}</div>
          <h1>{brand?.welcome_title || brand?.name || t("welcome")}</h1>
          <p>{brand?.welcome_message || t("guestSub")}</p>
          {brand?.address && <p className="guest-contact">{brand.address}</p>}
          {brand?.phone && (
            <a
              className="guest-contact"
              href={`tel:${brand.phone.replace(/[^+0-9]/g, "")}`}
            >
              {brand.phone}
            </a>
          )}
          {brand?.opening_hours && <small>{brand.opening_hours}</small>}
        </div>
        {!w.user && (
          <section className="panel">
            <Empty
              title={t("welcome")}
              body={!supabase ? t("setupText") : t("noTable")}
            >
              <Button
                disabled={!supabase || busy}
                onClick={() =>
                  void run(async () => {
                    const { error } = await supabase!.auth.signInAnonymously();
                    if (error) throw error;
                  })
                }
              >
                {t("browse")}
                <ArrowRight size={16} />
              </Button>
            </Empty>
          </section>
        )}
        {(error || w.error) && (
          <div className="error-banner" role="alert">
            {error || w.error}
            <Button variant="ghost" onClick={() => void w.refresh()}>
              {t("retry")}
            </Button>
          </div>
        )}
        {!w.online && <div className="error-banner">{t("offline")}</div>}
        {w.loading && <div className="loading-line" />}
        {w.sessionId && (
          <>
            <div className="guest-toolbar">
              <div className="tabs">
                <button
                  className={tab === "menu" ? "selected" : ""}
                  onClick={() => setTab("menu")}
                >
                  {t("browse")}
                </button>
                <button
                  className={tab === "orders" ? "selected" : ""}
                  onClick={() => setTab("orders")}
                >
                  {t("progress")} <span>{w.orders.length}</span>
                </button>
              </div>
              <Button
                disabled={busy || !w.online}
                variant="outline"
                onClick={() =>
                  void run(
                    () =>
                      rpc("request_service", {
                        p_session: w.sessionId,
                        p_message:
                          locale === "de"
                            ? "Bitte kommen Sie zum Tisch."
                            : tx("Please visit the table."),
                      }),
                    t("success"),
                  )
                }
              >
                <Bell size={16} />
                {t("callWaiter")}
              </Button>
            </div>
            {tab === "menu" ? (
              <div className="guest-content">
                <section>
                  <div className="tabs category-tabs">
                    <button
                      className={category === "all" ? "selected" : ""}
                      onClick={() => setCategory("all")}
                    >
                      {t("all")}
                    </button>
                    {w.categories.map((c) => (
                      <button
                        key={c.id}
                        className={category === c.id ? "selected" : ""}
                        onClick={() => setCategory(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  <div className="menu-grid">
                    {w.menu
                      .filter(
                        (i) =>
                          i.available &&
                          (category === "all" || i.category_id === category),
                      )
                      .map((item) => (
                        <motion.article
                          className="menu-card"
                          key={item.id}
                          initial={
                            reducedMotion ? false : { opacity: 0, y: 12 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          whileHover={reducedMotion ? undefined : { y: -3 }}
                        >
                          <div className="dish-image">
                            {item.image_url ? (
                              <img alt={item.name} src={item.image_url} />
                            ) : (
                              <Leaf size={40} strokeWidth={1} />
                            )}
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
                            <p>{item.description}</p>
                            {item.ingredients.length > 0 && (
                              <small>{item.ingredients.join(" · ")}</small>
                            )}
                            {item.allergens.length > 0 && (
                              <small>
                                <strong>
                                  {locale === "de"
                                    ? "Allergene"
                                    : tx("Allergens")}
                                  :
                                </strong>{" "}
                                {item.allergens.join(", ")}
                              </small>
                            )}
                            {item.video_url && (
                              <video
                                controls
                                preload="none"
                                src={item.video_url}
                                aria-label={item.name}
                              />
                            )}
                            <motion.button
                              type="button"
                              className="drag-handle"
                              disabled={!!pending}
                              drag={!pending}
                              dragSnapToOrigin
                              dragMomentum={false}
                              aria-label={`${tx("Drag to your order")}: ${item.name}`}
                              onDragStart={() => setDragging(true)}
                              onDrag={(_, info) => {
                                const r =
                                  dropTarget.current?.getBoundingClientRect();
                                setOverDrop(
                                  !!r &&
                                    info.point.x - window.scrollX >= r.left &&
                                    info.point.x - window.scrollX <= r.right &&
                                    info.point.y - window.scrollY >= r.top &&
                                    info.point.y - window.scrollY <= r.bottom,
                                );
                              }}
                              onDragEnd={(_, info) => {
                                const r =
                                  dropTarget.current?.getBoundingClientRect();
                                if (
                                  r &&
                                  info.point.x - window.scrollX >= r.left &&
                                  info.point.x - window.scrollX <= r.right &&
                                  info.point.y - window.scrollY >= r.top &&
                                  info.point.y - window.scrollY <= r.bottom
                                )
                                  add(item.id);
                                setDragging(false);
                                setOverDrop(false);
                              }}
                            >
                              {tx("Drag to your order")} ↗
                            </motion.button>
                            <Button
                              variant="outline"
                              disabled={!!pending}
                              onClick={() => add(item.id)}
                            >
                              <Plus size={16} />
                              {t("addToOrder")}
                            </Button>
                          </div>
                        </motion.article>
                      ))}
                  </div>
                  {!w.menu.some((i) => i.available) && (
                    <Empty title={t("empty")} icon={<Utensils />} />
                  )}
                </section>
                <aside className="cart panel">
                  <div className="section-heading">
                    <h2>{t("yourOrder")}</h2>
                    <ShoppingBag size={20} />
                  </div>
                  {cart.length ? (
                    cart.map((item) => {
                      const dish = w.menu.find(
                        (i) => i.id === item.menu_item_id,
                      );
                      return (
                        <div key={item.menu_item_id} className="cart-item">
                          <strong>
                            {dish?.name || tx("Unavailable item")}
                          </strong>
                          <div className="quantity-control">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`${tx("Decrease")}: ${dish?.name}`}
                              disabled={!!pending}
                              onClick={() =>
                                setCart((c) =>
                                  c
                                    .map((i) =>
                                      i === item
                                        ? { ...i, quantity: i.quantity - 1 }
                                        : i,
                                    )
                                    .filter((i) => i.quantity > 0),
                                )
                              }
                            >
                              <Minus size={15} />
                            </Button>
                            <span>{item.quantity}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`${tx("Increase")}: ${dish?.name}`}
                              disabled={!!pending || item.quantity >= 20}
                              onClick={() => add(item.menu_item_id)}
                            >
                              <Plus size={15} />
                            </Button>
                            <span>
                              {money(
                                (dish?.price_cents ?? 0) * item.quantity,
                                w.restaurant?.currency,
                                locale,
                              )}
                            </span>
                          </div>
                          <Button
                            className="cart-remove"
                            variant="ghost"
                            disabled={!!pending}
                            onClick={() => {
                              setCart((c) =>
                                c.filter(
                                  (i) => i.menu_item_id !== item.menu_item_id,
                                ),
                              );
                              notify(tx("Item removed"));
                            }}
                          >
                            {tx("Remove")}
                          </Button>
                          <textarea
                            aria-label={`${t("special")}: ${dish?.name}`}
                            placeholder={t("special")}
                            maxLength={500}
                            disabled={!!pending}
                            value={item.instructions}
                            onChange={(e) =>
                              setCart((c) =>
                                c.map((i) =>
                                  i === item
                                    ? { ...i, instructions: e.target.value }
                                    : i,
                                ),
                              )
                            }
                          />
                        </div>
                      );
                    })
                  ) : (
                    <Empty title={t("emptyCart")} icon={<ShoppingBag />} />
                  )}
                  <div className="cart-total">
                    <span>{t("total")}</span>
                    <strong>
                      {money(total, w.restaurant?.currency, locale)}
                    </strong>
                  </div>
                  <Button
                    disabled={!cart.length || busy || !w.online}
                    onClick={() => void send()}
                  >
                    {pending ? t("retry") : t("sendOrder")}
                    <ArrowRight size={16} />
                  </Button>
                  {pending && (
                    <p role="status" className="pending-note">
                      {locale === "de"
                        ? "Bestätigung ausstehend. Erneut versuchen sendet dieselbe Bestellung."
                        : tx(
                            "Confirmation pending. Retry safely resends the same ticket.",
                          )}
                    </p>
                  )}
                  <p className="cart-note">{t("ticketNote")}</p>
                </aside>
              </div>
            ) : (
              <div className="ticket-grid">
                {w.orders.map((o) => (
                  <Ticket
                    key={o.id}
                    order={o}
                    t={t}
                    locale={locale}
                    busy={busy}
                  >
                    {o.status === "placed" && (
                      <div className="guest-item-actions">
                        {o.order_items
                          .filter((i) => !i.cancelled)
                          .map((i) => (
                            <Button
                              variant="outline"
                              key={i.id}
                              disabled={busy}
                              onClick={() => setEdit(i)}
                            >
                              {t("edit")}: {i.name}
                            </Button>
                          ))}
                      </div>
                    )}
                    {o.status === "served" &&
                      !w.feedback.some((f) => f.order_id === o.id) && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => setRatingOrder(o)}
                        >
                          {t("rate")}
                        </Button>
                      )}
                  </Ticket>
                ))}
                {w.orders.length === 0 && (
                  <section className="panel full-width">
                    <Empty title={t("empty")} icon={<ChefHat />} />
                  </section>
                )}
              </div>
            )}
          </>
        )}
      </main>
      {dragging && (
        <div
          ref={dropTarget}
          className={`cart-drop-target ${overDrop ? "is-over" : ""}`}
        >
          {tx("Drop here to add to your order")}
        </div>
      )}
      <ToastBridge message={notice} />
      <ToastBridge message={error || w.error} kind="error" />
      {edit && (
        <Modal title={`${t("edit")}: ${edit.name}`} close={() => setEdit(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await run(
                  () =>
                    rpc("edit_order_item", {
                      p_item: edit.id,
                      p_quantity: Number(f.get("quantity")),
                      p_instructions: f.get("instructions"),
                      p_cancel: false,
                    }),
                  t("success"),
                )
              )
                setEdit(null);
            }}
          >
            <Field label={t("quantity")}>
              <input
                name="quantity"
                type="number"
                min={1}
                max={20}
                required
                defaultValue={edit.quantity}
              />
            </Field>
            <Field label={t("special")}>
              <textarea
                name="instructions"
                maxLength={500}
                defaultValue={edit.instructions}
              />
            </Field>
            <div className="form-actions">
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  if (
                    await run(() =>
                      rpc("edit_order_item", {
                        p_item: edit.id,
                        p_quantity: edit.quantity,
                        p_instructions: edit.instructions,
                        p_cancel: true,
                      }),
                    )
                  )
                    setEdit(null);
                }}
              >
                {t("remove")}
              </Button>
              <Button disabled={busy}>{t("save")}</Button>
            </div>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
      {ratingOrder && (
        <Modal title={t("rate")} close={() => setRatingOrder(null)}>
          <form
            onSubmit={async (e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await run(
                  () =>
                    rpc("submit_feedback", {
                      p_order: ratingOrder.id,
                      p_rating: Number(f.get("rating")),
                      p_comment: f.get("comment"),
                    }),
                  t("success"),
                )
              )
                setRatingOrder(null);
            }}
          >
            <Field label={tx("Rating")}>
              <select name="rating">
                {[5, 4, 3, 2, 1].map((n) => (
                  <option value={n} key={n}>
                    {"★".repeat(n)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("feedback")}>
              <textarea name="comment" maxLength={2000} />
            </Field>
            <Button disabled={busy}>{t("submit")}</Button>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
