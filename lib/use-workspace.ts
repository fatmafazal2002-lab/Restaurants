"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { canUsePortal, type Portal } from "./portals";
import type { Branding } from "./branding";
import { rpc, supabase } from "./supabase";
import { errorMessage } from "./utils";
import type {
  Category,
  DiningTable,
  Feedback,
  Membership,
  MenuItem,
  Order,
  Restaurant,
  ServiceRequest,
} from "./types";
export function useWorkspace(portal?: Portal, tenantSlug?: string) {
  const [previewBrand, setPreviewBrand] = useState<Branding | null>(null);
  const [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(!supabase);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]),
    [restaurantId, setRestaurantId] = useState("");
  const [memberships, setMemberships] = useState<Membership[]>([]),
    [menu, setMenu] = useState<MenuItem[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [orders, setOrders] = useState<Order[]>([]),
    [tables, setTables] = useState<DiningTable[]>([]),
    [requests, setRequests] = useState<ServiceRequest[]>([]),
    [feedback, setFeedback] = useState<Feedback[]>([]);
  const [guestToken, setGuestToken] = useState<string | null>(null),
    [sessionId, setSessionId] = useState(""),
    [platformAdmin, setPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [online, setOnline] = useState(true),
    [live, setLive] = useState(false);
  const generation = useRef(0),
    identity = useRef<string | null>(null);
  useEffect(() => {
    setGuestToken(new URLSearchParams(location.search).get("table"));
    const query = new URLSearchParams(location.search);
    if (
      supabase &&
      (query.get("table") || query.get("restaurant") || tenantSlug)
    ) {
      void rpc<Branding | null>("get_public_branding", {
        p_token: query.get("table"),
        p_slug: tenantSlug || query.get("restaurant"),
      })
        .then(setPreviewBrand)
        .catch(() => setPreviewBrand(null));
    }
    setOnline(navigator.onLine);
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if (!supabase)
      return () => {
        window.removeEventListener("online", on);
        window.removeEventListener("offline", off);
      };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user?.id ?? null;
      if (identity.current !== next) {
        generation.current++;
        identity.current = next;
        setRestaurants([]);
        setRestaurantId("");
        setMemberships([]);
        setMenu([]);
        setCategories([]);
        setOrders([]);
        setTables([]);
        setRequests([]);
        setFeedback([]);
        setSessionId("");
        setPlatformAdmin(false);
        setLoading(false);
        setError("");
      }
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [tenantSlug]);
  const refresh = useCallback(async () => {
    if (!supabase || !authReady) return;
    const gen = ++generation.current;
    if (!user) {
      setRestaurants([]);
      setMenu([]);
      setCategories([]);
      setOrders([]);
      setMemberships([]);
      setTables([]);
      setRequests([]);
      setFeedback([]);
      setSessionId("");
      setRestaurantId("");
      setPlatformAdmin(false);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const checked = async <T>(
        query: PromiseLike<{ data: unknown; error: unknown }>,
      ) => {
        const { data, error } = await query;
        if (error) throw error;
        return data as T;
      };
      if (!user.is_anonymous) await rpc("claim_employee_access", {});
      let rid = restaurantId;
      let sid = "";
      if (guestToken) {
        sid = await rpc<string>("join_table", { p_token: guestToken });
        const s = await checked<{ restaurant_id: string }>(
          supabase
            .from("table_sessions")
            .select("restaurant_id")
            .eq("id", sid)
            .single(),
        );
        rid = s.restaurant_id;
      }
      const [rs, ms, pa] = await Promise.all([
        checked<Restaurant[]>(
          supabase.from("restaurants").select("*").order("created_at"),
        ),
        checked<Membership[]>(supabase.from("memberships").select("*")),
        checked<{ user_id: string }[]>(
          supabase.from("platform_admins").select("user_id"),
        ),
      ]);
      if (gen !== generation.current) return;
      if (tenantSlug && !guestToken) {
        const tenant = rs.find((r) => r.slug === tenantSlug);
        if (!tenant)
          throw new Error("You do not have access to this restaurant.");
        rid = tenant.id;
      }
      if (!rs.some((r) => r.id === rid)) {
        const branded = rs.find(
          (r) =>
            r.slug ===
            (tenantSlug ||
              new URLSearchParams(location.search).get("restaurant")),
        );
        const matching = rs.find((r) =>
          ms.some(
            (m) =>
              m.restaurant_id === r.id &&
              m.user_id === user.id &&
              (!portal || canUsePortal(m.role, portal)),
          ),
        );
        rid = branded?.id ?? matching?.id ?? rs[0]?.id ?? "";
      }
      setRestaurants(rs);
      setMemberships(ms);
      setPlatformAdmin(pa.length > 0);
      setRestaurantId(rid);
      setSessionId(sid);
      if (!rid) {
        setMenu([]);
        setOrders([]);
        return;
      }
      const member = ms.find(
        (m) => m.restaurant_id === rid && m.user_id === user.id,
      );
      const loadActive = async () => {
        const result: Order[] = [];
        let cursor: string | null = null;
        while (true) {
          let query = supabase!
            .from("orders")
            .select("*,order_items(*)")
            .eq("restaurant_id", rid)
            .in("status", ["placed", "preparing", "ready"])
            .order("id")
            .limit(200);
          if (cursor) query = query.gt("id", cursor);
          const batch = await checked<Order[]>(query);
          result.push(...batch);
          if (batch.length < 200) return result;
          cursor = batch[batch.length - 1].id;
        }
      };
      const [mi, ca, or, ta, re, fe, active] = await Promise.all([
        checked<MenuItem[]>(
          supabase
            .from("menu_items")
            .select("*")
            .eq("archived", false)
            .eq("restaurant_id", rid)
            .order("created_at"),
        ),
        checked<Category[]>(
          supabase
            .from("categories")
            .select("*")
            .eq("restaurant_id", rid)
            .order("position"),
        ),
        checked<Order[]>(
          supabase
            .from("orders")
            .select("*,order_items(*)")
            .eq("restaurant_id", rid)
            .order("created_at", { ascending: false })
            .limit(200),
        ),
        member
          ? checked<DiningTable[]>(
              supabase
                .from("dining_tables")
                .select("*")
                .eq("restaurant_id", rid)
                .order("name"),
            )
          : Promise.resolve([]),
        checked<ServiceRequest[]>(
          supabase
            .from("service_requests")
            .select("*")
            .eq("restaurant_id", rid)
            .eq("resolved", false),
        ),
        checked<Feedback[]>(
          supabase
            .from("feedback")
            .select("*")
            .eq("restaurant_id", rid)
            .order("created_at", { ascending: false })
            .limit(200),
        ),
        loadActive(),
      ]);
      if (gen !== generation.current) return;
      setMenu(mi);
      setCategories(ca);
      setOrders(
        Array.from(
          new Map([...or, ...active].map((o) => [o.id, o])).values(),
        ).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
      setTables(ta);
      setRequests(re);
      setFeedback(fe);
    } catch (e) {
      if (gen === generation.current) setError(errorMessage(e));
    } finally {
      if (gen === generation.current) setLoading(false);
    }
  }, [authReady, user, restaurantId, guestToken, portal, tenantSlug]);
  useEffect(() => {
    void refresh();
  }, [refresh, online]);
  useEffect(() => {
    if (!supabase || !user || !restaurantId) return;
    let timer: ReturnType<typeof setTimeout>;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    const channel = supabase.channel(`workspace:${restaurantId}:${user.id}`);
    ["orders", "order_items", "service_requests", "menu_items"].forEach(
      (table) =>
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `restaurant_id=eq.${restaurantId}`,
          },
          reload,
        ),
    );
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "restaurants",
        filter: `id=eq.${restaurantId}`,
      },
      reload,
    );
    channel.subscribe((status) => {
      setLive(status === "SUBSCRIBED");
      if (status === "SUBSCRIBED") reload();
    });
    const interval = setInterval(reload, 30000); // Recover missed events after reconnects.
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      setLive(false);
      void supabase?.removeChannel(channel);
    };
  }, [restaurantId, user, refresh]);
  return {
    user,
    previewBrand,
    authReady,
    restaurants,
    restaurantId,
    setRestaurantId,
    restaurant: restaurants.find((r) => r.id === restaurantId),
    memberships,
    role: memberships.find(
      (m) => m.restaurant_id === restaurantId && m.user_id === user?.id,
    )?.role,
    menu,
    categories,
    orders,
    tables,
    requests,
    feedback,
    guestToken,
    sessionId,
    platformAdmin,
    loading,
    error,
    online,
    live,
    refresh,
  };
}
export type WorkspaceData = ReturnType<typeof useWorkspace>;
