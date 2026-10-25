// Explicit deployment smoke test. Creates and removes only its own temporary fixtures.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
process.loadEnvFile(".env.local");
const ref = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!ref || url !== `https://${ref}.supabase.co`)
  throw new Error(
    "Pass the exact configured project ref to authorize temporary fixtures.",
  );
const response = JSON.parse(
  execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", ref, "-o", "json"],
    { encoding: "utf8" },
  ),
);
const keys = Array.isArray(response)
  ? response
  : (response.api_keys ?? response.keys);
const service = keys.find((k) => k.name === "service_role")?.api_key;
if (!service)
  throw new Error("Admin API key unavailable; key values were not logged.");
const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const clients = [];
const users = [];
let restaurant;
const temporaryPlan = `verify-${randomUUID()}`;
const temporaryFeature = `verify_${randomUUID().replaceAll("-", "_")}`;
const databaseUrl = new URL(
  readFileSync("supabase/.temp/pooler-url", "utf8").trim(),
);
databaseUrl.password = process.env.SUPABASE_DB_PASSWORD;
const pool = new pg.Pool({
  connectionString: databaseUrl.toString(),
  max: 4,
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync("supabase/.temp/pgdelta/pgdelta-target-ca.crt", "utf8"),
  },
  connectionTimeoutMillis: 15000,
});
const checked = async (p) => {
  const { data, error } = await p;
  if (error) throw error;
  return data;
};
const makeClient = () => {
  const c = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clients.push(c);
  return c;
};
async function account(role) {
  const email = `mise-verification-${role}-${randomUUID()}@example.com`;
  const password = randomUUID() + randomUUID();
  const result = await checked(
    admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  users.push(result.user.id);
  const client = makeClient();
  await checked(client.auth.signInWithPassword({ email, password }));
  return { client, email, id: result.user.id };
}
let realtimeTimer;
try {
  await pool.query("select 1");
  const owner = await account("owner"),
    cook = await account("cook"),
    waiter = await account("waiter"),
    manager = await account("admin");
  restaurant = await checked(
    owner.client.rpc("create_restaurant", {
      p_name: "Temporary deployment verification",
      p_slug: `verify-${randomUUID()}`,
    }),
  );
  for (const [actor, role] of [
    [cook, "cook"],
    [waiter, "waiter"],
    [manager, "admin"],
  ])
    await checked(
      owner.client.rpc("add_staff", {
        p_restaurant: restaurant,
        p_email: actor.email,
        p_role: role,
      }),
    );
  await checked(
    manager.client.rpc("add_staff", {
      p_restaurant: restaurant,
      p_email: cook.email,
      p_role: "cook",
    }),
  );
  const elevation = await manager.client.rpc("add_staff", {
    p_restaurant: restaurant,
    p_email: waiter.email,
    p_role: "admin",
  });
  assert.ok(elevation.error);
  const branding = {
    name: "Temporary deployment verification",
    brand_color: "#335577",
    accent_color: "#cc9955",
    theme_mode: "dark",
    heading_font: "friendly",
    density: "compact",
    show_avatars: false,
    welcome_title: "Welcome to the test kitchen",
    welcome_message: "A temporary verification fixture",
    cover_url: "https://example.com/cover.webp",
    font_family: "editorial",
    interface_style: "soft",
    menu_layout: "list",
    address: "Verification address",
    phone: "+49 000 000",
    contact: "",
    opening_hours: "",
  };
  await checked(
    manager.client.rpc("save_restaurant", {
      p_restaurant: restaurant,
      p_data: branding,
    }),
  );
  const forbidden = await cook.client.rpc("save_restaurant", {
    p_restaurant: restaurant,
    p_data: branding,
  });
  assert.ok(forbidden.error);
  const savedBrand = await checked(
    owner.client.from("restaurants").select("*").eq("id", restaurant).single(),
  );
  assert.equal(savedBrand.theme_mode, "dark");
  assert.equal(savedBrand.font_family, "editorial");
  assert.equal(savedBrand.phone, "+49 000 000");
  const publicClient = makeClient();
  const publicBrand = await checked(
    publicClient.rpc("get_public_branding", {
      p_slug: savedBrand.slug,
      p_token: null,
    }),
  );
  assert.equal(publicBrand.theme_mode, "dark");
  assert.equal(publicBrand.heading_font, "friendly");
  assert.equal(publicBrand.density, "compact");
  assert.equal(publicBrand.show_avatars, false);
  assert.equal(publicBrand.welcome_title, "Welcome to the test kitchen");
  assert.equal(publicBrand.cover_url, "https://example.com/cover.webp");
  assert.equal(publicBrand.plan_id, undefined);
  const directory = await checked(
    manager.client.rpc("list_staff", { p_restaurant: restaurant }),
  );
  assert.equal(directory.length, 4);
  const privateDirectory = await waiter.client.rpc("list_staff", {
    p_restaurant: restaurant,
  });
  assert.ok(privateDirectory.error);
  console.log(
    "PASS: admin/operational role boundaries, saved branding, public presentation and private staff directory.",
  );
  const category = await checked(
    owner.client.rpc("save_category", {
      p_restaurant: restaurant,
      p_name: "Verification only",
    }),
  );
  const dish = await checked(
    owner.client.rpc("save_menu_item", {
      p_restaurant: restaurant,
      p_id: null,
      p_data: {
        name: "Temporary test dish",
        price_cents: 1250,
        category_id: category,
        available: true,
        ingredients: [],
        allergens: [],
      },
    }),
  );
  const table = await checked(
    owner.client.rpc("create_table", {
      p_restaurant: restaurant,
      p_name: "Verification table",
    }),
  );
  const tableRow = await checked(
    owner.client.from("dining_tables").select("*").eq("id", table).single(),
  );
  const guest = makeClient(),
    outsider = makeClient();
  for (const c of [guest, outsider]) {
    const result = await checked(c.auth.signInAnonymously());
    users.push(result.user.id);
  }
  assert.equal(
    (
      await checked(
        outsider
          .from("menu_items")
          .select("id")
          .eq("restaurant_id", restaurant),
      )
    ).length,
    0,
  );
  const session = await checked(
    guest.rpc("join_table", { p_token: tableRow.access_token }),
  );
  assert.equal(
    (await checked(guest.from("dining_tables").select("id").eq("id", table)))
      .length,
    0,
  );
  const key = randomUUID();
  const payload = {
    p_session: session,
    p_key: key,
    p_items: [
      { menu_item_id: dish, quantity: 2, instructions: "Verification only" },
    ],
  };
  const duplicate = await Promise.all([
    checked(guest.rpc("place_order", payload)),
    checked(guest.rpc("place_order", payload)),
    checked(guest.rpc("place_order", payload)),
  ]);
  assert.equal(new Set(duplicate).size, 1);
  const order = duplicate[0];
  const item = (
    await checked(guest.from("order_items").select("*").eq("order_id", order))
  )[0];
  assert.equal(item.price_cents, 1250);
  console.log(
    "PASS: real Auth, onboarding, staff assignment, guest session, tenant isolation, price snapshot and concurrent idempotency.",
  );
  const denied = await waiter.client.rpc("transition_order", {
    p_order: order,
    p_expected: "placed",
    p_next: "preparing",
  });
  assert.ok(denied.error);
  const start = () =>
    cook.client.rpc("transition_order", {
      p_order: order,
      p_expected: "placed",
      p_next: "preparing",
    });
  const transitions = await Promise.all([start(), start()]);
  assert.equal(transitions.filter((r) => !r.error).length, 1);
  const locked = await guest.rpc("edit_order_item", {
    p_item: item.id,
    p_quantity: 3,
    p_instructions: "Blocked late edit",
    p_cancel: false,
  });
  assert.ok(locked.error);
  const addon = await checked(
    guest.rpc("place_order", { ...payload, p_key: randomUUID() }),
  );
  assert.notEqual(addon, order);
  const addonState = await checked(
    guest.from("orders").select("status").eq("id", addon).single(),
  );
  assert.equal(addonState.status, "placed");
  console.log(
    "PASS: role authorization, simultaneous transition protection, preparation lock and independent add-on ticket.",
  );
  let resolveEvent;
  const received = new Promise((resolve) => {
    resolveEvent = resolve;
  });
  let resolveDatabaseReady;
  const databaseReady = new Promise((resolve) => {
    resolveDatabaseReady = resolve;
  });
  const channel = guest
    .channel(`verify-${randomUUID()}`)
    .on("system", {}, (event) => {
      console.log("Realtime system:", JSON.stringify(event));
      if (event.extension === "postgres_changes" && event.status === "ok")
        resolveDatabaseReady(true);
    })
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "orders",
        filter: `id=eq.${order}`,
      },
      (event) => {
        console.log("Realtime order event:", event.eventType, event.new.status);
        if (event.new.status === "ready") resolveEvent(true);
      },
    );
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Realtime subscribe timeout")),
      15000,
    );
    channel.subscribe((status, error) => {
      console.log("Realtime subscription:", status, error?.message ?? "");
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (status === "CHANNEL_ERROR") {
        clearTimeout(timeout);
        reject(new Error("Realtime subscribe failed"));
      }
    });
  });
  const subscriptionReady = await Promise.race([
    databaseReady,
    new Promise((resolve) => {
      realtimeTimer = setTimeout(() => resolve(false), 15000);
    }),
  ]);
  clearTimeout(realtimeTimer);
  assert.equal(
    subscriptionReady,
    true,
    "Database change subscription must be ready before mutation",
  );
  await checked(
    cook.client.rpc("transition_order", {
      p_order: order,
      p_expected: "preparing",
      p_next: "ready",
    }),
  );
  const event = await Promise.race([
    received,
    new Promise((resolve) => {
      realtimeTimer = setTimeout(() => resolve(false), 15000);
    }),
  ]);
  clearTimeout(realtimeTimer);
  assert.equal(event, true, "Guest must receive ready status via Realtime");
  await checked(
    waiter.client.rpc("transition_order", {
      p_order: order,
      p_expected: "ready",
      p_next: "served",
    }),
  );
  await checked(
    guest.rpc("submit_feedback", {
      p_order: order,
      p_rating: 5,
      p_comment: "Temporary automated verification",
    }),
  );
  await checked(
    guest.rpc("request_service", {
      p_session: session,
      p_message: "Temporary verification request",
    }),
  );
  const request = (
    await checked(
      waiter.client
        .from("service_requests")
        .select("id")
        .eq("restaurant_id", restaurant),
    )
  )[0];
  await checked(
    waiter.client.rpc("resolve_request", { p_request: request.id }),
  );
  console.log(
    "PASS: Realtime guest update, served transition, verified feedback and waiter request resolution.",
  );
  const objectPath = `${restaurant}/verification-${randomUUID()}.png`;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZr0AAAAASUVORK5CYII=",
    "base64",
  );
  await checked(
    owner.client.storage
      .from("restaurant-media")
      .upload(objectPath, png, { contentType: "image/png" }),
  );
  await checked(
    owner.client.storage.from("restaurant-media").remove([objectPath]),
  );
  console.log("PASS: real Supabase Storage upload and removal.");
  const operator = await account("platform");
  assert.equal(await checked(owner.client.rpc("is_platform_admin", {})), false);
  const forbiddenPlatform = await owner.client.rpc(
    "platform_update_restaurant",
    { p_restaurant: restaurant, p_plan: "enterprise", p_active: false },
  );
  assert.ok(forbiddenPlatform.error);
  await pool.query("insert into public.platform_admins(user_id) values($1)", [
    operator.id,
  ]);
  assert.equal(
    await checked(operator.client.rpc("is_platform_admin", {})),
    true,
  );
  await checked(
    operator.client.rpc("platform_update_restaurant", {
      p_restaurant: restaurant,
      p_plan: "enterprise",
      p_active: false,
    }),
  );
  const paused = await checked(
    operator.client
      .from("restaurants")
      .select("plan_id,active")
      .eq("id", restaurant)
      .single(),
  );
  assert.equal(paused.plan_id, "enterprise");
  assert.equal(paused.active, false);
  const pausedJoin = await guest.rpc("join_table", {
    p_token: tableRow.access_token,
  });
  assert.ok(pausedJoin.error);
  await checked(
    operator.client.rpc("platform_update_restaurant", {
      p_restaurant: restaurant,
      p_plan: "starter",
      p_active: true,
    }),
  );
  const forbiddenAnalytics=await owner.client.rpc("platform_analytics",{p_days:30});
  assert.ok(forbiddenAnalytics.error);
  await checked(operator.client.rpc("platform_save_feature",{p_code:temporaryFeature,p_name:"Verification feature",p_name_tr:"Doğrulama özelliği",p_description:"Temporary fixture"}));
  const temporaryData={name:"Verification package",table_limit:20,staff_limit:12,menu_limit:150,monthly_price_cents:7500,currency:"EUR",description:"Temporary fixture",description_tr:"Geçici doğrulama",published:false};
  await checked(operator.client.rpc("platform_save_plan",{p_id:temporaryPlan,p_data:temporaryData,p_features:[temporaryFeature]}));
  const publicCatalogue=await checked(makeClient().rpc("get_public_plans",{}));
  assert.ok(publicCatalogue.some(p=>p.id==="starter" && p.monthly_price_cents>=0));
  assert.equal(publicCatalogue.some(p=>p.id===temporaryPlan),false);
  await checked(operator.client.rpc("platform_update_restaurant",{p_restaurant:restaurant,p_plan:temporaryPlan,p_active:true}));
  const blockedOrder=await guest.rpc("place_order",{...payload,p_key:randomUUID()});
  assert.ok(blockedOrder.error?.message.includes("Feature is not included"));
  const report=await checked(operator.client.rpc("platform_analytics",{p_days:7}));
  assert.equal(report.days,7);assert.equal(report.daily.length,7);assert.ok(report.orders>=2);assert.ok(report.currency_totals.some(t=>t.currency==="EUR"&&Number(t.served_value_cents)>0));
  await checked(operator.client.rpc("platform_save_plan",{p_id:temporaryPlan,p_data:{...temporaryData,monthly_price_cents:8000},p_features:[temporaryFeature]}));
  const changeLog=await checked(operator.client.from("platform_audit").select("before_data,after_data").eq("entity",temporaryPlan).order("id",{ascending:false}).limit(1));
  assert.equal(changeLog[0].before_data.plan.monthly_price_cents,7500);assert.equal(changeLog[0].after_data.plan.monthly_price_cents,8000);
  await checked(operator.client.rpc("platform_update_restaurant",{p_restaurant:restaurant,p_plan:"starter",p_active:true}));
  console.log("PASS: aggregate analytics, catalogue prices, feature enforcement, private reporting and before/after audit history.");
  const signedOut = await operator.client.auth.signOut({ scope: "local" });
  if (signedOut.error) throw signedOut.error;
  const sessionAfter = await operator.client.auth.getSession();
  assert.equal(sessionAfter.data.session, null);
  assert.equal(
    await checked(
      operator.client.rpc("get_public_branding", {
        p_slug: "not-a-real-restaurant",
      }),
    ),
    null,
  );
  console.log(
    "PASS: platform-only plan/status controls, suspension, reactivation and local sign-out.",
  );
} finally {
  clearTimeout(realtimeTimer);
  for (const client of clients) await client.removeAllChannels();
  if (restaurant) {
    for (const table of [
      "order_items",
      "feedback",
      "orders",
      "service_requests",
      "audit_logs",
      "table_sessions",
      "menu_items",
      "categories",
      "dining_tables",
      "memberships",
    ])
      await pool.query(`delete from public.${table} where restaurant_id=$1`, [
        restaurant,
      ]);
    await pool.query("delete from public.restaurants where id=$1", [
      restaurant,
    ]);
  }
  await pool.query("delete from public.plans where id=$1",[temporaryPlan]);
  await pool.query("delete from public.plan_features where code=$1",[temporaryFeature]);
  await pool.query("delete from public.platform_audit where actor_id=any($1::uuid[])",[users]);
  for (const user of users) await checked(admin.auth.admin.deleteUser(user));
  await pool.end();
  console.log(
    "Temporary verification accounts and restaurant records removed.",
  );
}
