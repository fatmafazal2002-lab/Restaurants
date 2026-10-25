import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
// Runs production SQL against embedded PostgreSQL. Only Supabase-owned auth/storage
// schemas are compatibility fixtures. This does not emulate Realtime or HTTP Auth.
const db = new PGlite();
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1),
  otherOwner = id(2),
  cook = id(3),
  waiter = id(4),
  guest = id(5),
  otherGuest = id(6),
  platform = id(7);
const a = id(10),
  b = id(11),
  ta = id(20),
  tb = id(21),
  token = id(22),
  menuA = id(30),
  menuB = id(31),
  session = id(40),
  key = id(50);
async function asUser<T>(
  uid: string,
  fn: () => Promise<T>,
  anonymous = uid === guest || uid === otherGuest,
): Promise<T> {
  await db.exec("begin; set local role authenticated;");
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: uid, is_anonymous: anonymous }),
  ]);
  try {
    return await fn();
  } finally {
    await db.exec("rollback");
  }
}
async function place(
  items = [{ menu_item_id: menuA, quantity: 2, instructions: "No onion" }],
  requestKey = key,
) {
  const r = await db.query<{ id: string }>(
    "select public.place_order($1,$2,$3::jsonb) as id",
    [session, requestKey, JSON.stringify(items)],
  );
  return r.rows[0].id;
}
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,is_anonymous boolean default false,email_confirmed_at timestamptz default now());
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth,public to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant insert,select,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 create publication supabase_realtime;`);
  for (const file of readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  await db.query(
    "insert into auth.users(id,email,is_anonymous) values ($1,'owner@example.com',false),($2,'other@example.com',false),($3,'cook@example.com',false),($4,'waiter@example.com',false),($5,null,true),($6,null,true),($7,'platform@example.com',false)",
    [owner, otherOwner, cook, waiter, guest, otherGuest, platform],
  );
  await db.query(
    "insert into public.restaurants(id,name,slug) values($1,'Restaurant A','restaurant-a'),($2,'Restaurant B','restaurant-b')",
    [a, b],
  );
  await db.query(
    "insert into public.memberships values($1,$3,'owner'),($2,$4,'owner'),($1,$5,'cook'),($1,$6,'waiter')",
    [a, b, owner, otherOwner, cook, waiter],
  );
  await db.query(
    "insert into public.dining_tables(id,restaurant_id,name,access_token) values($1,$2,'Table 1',$3),($4,$5,'Table B',gen_random_uuid())",
    [ta, a, token, tb, b],
  );
  await db.query(
    "insert into public.menu_items(id,restaurant_id,name,price_cents) values($1,$2,'Soup',1250),($3,$4,'Private dish',999)",
    [menuA, a, menuB, b],
  );
  await db.query(
    "insert into public.table_sessions(id,restaurant_id,table_id,customer_id) values($1,$2,$3,$4)",
    [session, a, ta, guest],
  );
  await db.query("insert into public.platform_admins values($1)", [platform]);
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("production migration and tenant policies", () => {
  it("enables RLS for every application table", async () => {
    const r = await db.query<{ relname: string }>(
      "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' and not relrowsecurity",
    );
    expect(r.rows).toEqual([]);
  });
  it("isolates staff and guest reads to their tenant", async () => {
    for (const uid of [owner, cook, waiter, guest])
      await asUser(uid, async () => {
        const r = await db.query<{ id: string }>(
          "select id from public.restaurants",
        );
        expect(r.rows.map((r) => r.id)).toEqual([a]);
        const m = await db.query<{ id: string }>(
          "select id from public.menu_items",
        );
        expect(m.rows.map((r) => r.id)).toEqual([menuA]);
      });
  });
  it("hides all restaurant data from an unrelated guest", async () => {
    await asUser(otherGuest, async () => {
      expect(
        (await db.query("select * from public.menu_items")).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("select * from public.restaurants")).rows,
      ).toHaveLength(0);
    });
  });
  it("rejects direct workflow writes, even from the owner", async () => {
    await expect(
      asUser(owner, () => db.query("update public.orders set status='served'")),
    ).rejects.toThrow(/permission denied/);
  });
  it("does not expose table tokens to guests", async () => {
    await asUser(guest, async () => {
      expect(
        (await db.query("select * from public.dining_tables")).rows,
      ).toHaveLength(0);
    });
  });
  it("denies cross-tenant admin RPCs", async () => {
    await expect(
      asUser(owner, () =>
        db.query("select public.create_table($1,'Intrusion')", [b]),
      ),
    ).rejects.toThrow(/Not authorized/);
  });
  it("denies anonymous restaurant provisioning", async () => {
    await expect(
      asUser(guest, () =>
        db.query("select public.create_restaurant('Bad','bad-tenant')"),
      ),
    ).rejects.toThrow(/registered account/);
  });
  it("restricts SaaS operations to platform admins", async () => {
    await expect(
      asUser(owner, () =>
        db.query(
          "select public.platform_update_restaurant($1,'growth',false)",
          [a],
        ),
      ),
    ).rejects.toThrow(/Not authorized/);
    await asUser(platform, async () => {
      await db.query(
        "select public.platform_update_restaurant($1,'growth',false)",
        [a],
      );
      const result = await db.query<{ active: boolean }>(
        "select active from public.restaurants where id=$1",
        [a],
      );
      expect(result.rows[0].active).toBe(false);
    });
  });
  it("enforces tenant media upload boundaries", async () => {
    await expect(
      asUser(owner, () =>
        db.query(
          "insert into storage.objects(bucket_id,name) values('restaurant-media',$1)",
          [`${b}/image.png`],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await asUser(owner, () =>
      db.query(
        "insert into storage.objects(bucket_id,name) values('restaurant-media',$1)",
        [`${a}/image.png`],
      ),
    );
  });
});
describe("ordering and permissions", () => {
  it("snapshots server prices and deduplicates repeated submissions", async () => {
    await asUser(guest, async () => {
      const first = await place();
      expect(await place()).toBe(first);
      const r = await db.query<{ price_cents: number; quantity: number }>(
        "select price_cents,quantity from public.order_items where order_id=$1",
        [first],
      );
      expect(r.rows).toEqual([{ price_cents: 1250, quantity: 2 }]);
      expect((await db.query("select * from public.orders")).rows).toHaveLength(
        1,
      );
    });
  });
  it("rejects foreign menu items and rolls back the whole ticket", async () => {
    await expect(
      asUser(guest, () =>
        place([
          { menu_item_id: menuA, quantity: 1, instructions: "" },
          { menu_item_id: menuB, quantity: 1, instructions: "" },
        ]),
      ),
    ).rejects.toThrow(/no longer available/);
    expect((await db.query("select * from public.orders")).rows).toHaveLength(
      0,
    );
  });
  it("rejects zero quantity and unavailable items", async () => {
    await expect(
      asUser(guest, () =>
        place([{ menu_item_id: menuA, quantity: 0, instructions: "" }]),
      ),
    ).rejects.toThrow(/Quantity/);
    await db.query("update public.menu_items set available=false where id=$1", [
      menuA,
    ]);
    try {
      await expect(asUser(guest, () => place())).rejects.toThrow(
        /no longer available/,
      );
    } finally {
      await db.query(
        "update public.menu_items set available=true where id=$1",
        [menuA],
      );
    }
  });
  it("rejects expired or stolen sessions", async () => {
    await expect(asUser(otherGuest, () => place())).rejects.toThrow(
      /session expired/,
    );
    await db.query(
      "update public.table_sessions set expires_at=now()-interval '1 minute' where id=$1",
      [session],
    );
    try {
      await expect(asUser(guest, () => place())).rejects.toThrow(
        /session expired/,
      );
    } finally {
      await db.query(
        "update public.table_sessions set expires_at=now()+interval '12 hours' where id=$1",
        [session],
      );
    }
  });
  it("permits item edits and cancellation before preparation", async () => {
    await asUser(guest, async () => {
      const oid = await place();
      const row = await db.query<{ id: string }>(
        "select id from public.order_items where order_id=$1",
        [oid],
      );
      await db.query("select public.edit_order_item($1,3,'Less salt',false)", [
        row.rows[0].id,
      ]);
      expect(
        (
          await db.query<{ quantity: number }>(
            "select quantity from public.order_items",
          )
        ).rows[0].quantity,
      ).toBe(3);
      await db.query("select public.edit_order_item($1,3,'Less salt',true)", [
        row.rows[0].id,
      ]);
      expect(
        (await db.query<{ status: string }>("select status from public.orders"))
          .rows[0].status,
      ).toBe("cancelled");
    });
  });
  it("enforces role transitions, stale state, preparation locks, and independent additions", async () => {
    await db.exec("begin");
    try {
      const claims = async (uid: string) => {
        await db.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: uid, is_anonymous: uid === guest }),
        ]);
      };
      await claims(guest);
      const first = await place();
      const item = (
        await db.query<{ id: string }>(
          "select id from public.order_items where order_id=$1",
          [first],
        )
      ).rows[0].id;
      await claims(cook);
      await db.query(
        "select public.transition_order($1,'placed','preparing')",
        [first],
      );
      // SAVEPOINT keeps the parent fixture alive after expected SQL errors.
      async function fails(sql: string, params: unknown[], pattern: RegExp) {
        await db.exec("savepoint expected_failure");
        await expect(db.query(sql, params)).rejects.toThrow(pattern);
        await db.exec("rollback to savepoint expected_failure");
      }
      await fails(
        "select public.transition_order($1,'placed','preparing')",
        [first],
        /has changed/,
      );
      await fails(
        "select public.transition_order($1,null,'served')",
        [first],
        /not permitted/,
      );
      await claims(guest);
      await fails(
        "select public.edit_order_item($1,5,'late edit',false)",
        [item],
        /locked/,
      );
      await fails(
        "select public.transition_order($1,'preparing','ready')",
        [first],
        /Not authorized/,
      );
      const second = await place(undefined, id(51));
      expect(second).not.toBe(first);
      const states = await db.query<{ id: string; status: string }>(
        "select id,status from public.orders order by id",
      );
      expect(states.rows.find((r) => r.id === first)?.status).toBe("preparing");
      expect(states.rows.find((r) => r.id === second)?.status).toBe("placed");
      await claims(waiter);
      await fails(
        "select public.transition_order($1,'preparing','ready')",
        [first],
        /not permitted/,
      );
      await claims(cook);
      await db.query("select public.transition_order($1,'preparing','ready')", [
        first,
      ]);
      await fails(
        "select public.transition_order($1,'ready','served')",
        [first],
        /not permitted/,
      );
      await claims(waiter);
      await db.query("select public.transition_order($1,'ready','served')", [
        first,
      ]);
      await claims(guest);
      await db.query("select public.submit_feedback($1,5,'Excellent')", [
        first,
      ]);
      await fails(
        "select public.submit_feedback($1,5,'Duplicate')",
        [first],
        /unique/,
      );
    } finally {
      await db.exec("rollback");
    }
  });
  it("deduplicates outstanding waiter requests", async () => {
    await asUser(guest, async () => {
      await db.query("select public.request_service($1,'Water please')", [
        session,
      ]);
      expect(
        (await db.query("select * from public.service_requests")).rows,
      ).toHaveLength(1);
    });
  });
});

describe("restaurant onboarding errors", () => {
  it("rejects website addresses with actionable guidance rather than a constraint error", async () => {
    await expect(
      asUser(platform, () =>
        db.query(
          "select public.create_restaurant('Greenbites', 'www.greenbites.com')",
        ),
      ),
    ).rejects.toThrow(/not a website address/);
  });
  it("normalizes a valid identifier and assigns the owner atomically", async () => {
    await asUser(platform, async () => {
      const created = await db.query<{ id: string }>(
        "select public.create_restaurant('Greenbites', ' GreenBites ') id",
      );
      const row = await db.query<{ slug: string }>(
        "select slug from public.restaurants where id=$1",
        [created.rows[0].id],
      );
      expect(row.rows[0].slug).toBe("greenbites");
      const membership = await db.query<{ role: string }>(
        "select role from public.memberships where restaurant_id=$1",
        [created.rows[0].id],
      );
      expect(membership.rows[0].role).toBe("owner");
    });
  });
  it("returns a helpful duplicate identifier error", async () => {
    await expect(
      asUser(platform, () =>
        db.query(
          "select public.create_restaurant('Another A', 'restaurant-a')",
        ),
      ),
    ).rejects.toThrow(/already in use/);
  });
});

describe("restaurant branding and role management", () => {
  const settings = {
    name: "Restaurant A",
    brand_color: "#3355aa",
    accent_color: "#b58a56",
    address: "Test Street 1",
    phone: "+49 123 456",
    theme_mode: "dark",
    font_family: "editorial",
    interface_style: "soft",
    menu_layout: "list",
    logo_url: "https://example.com/logo.png",
  };
  it("persists branding for the authorized restaurant", async () => {
    await asUser(owner, async () => {
      await db.query("select public.save_restaurant($1,$2::jsonb)", [
        a,
        JSON.stringify(settings),
      ]);
      const r = await db.query<{
        theme_mode: string;
        phone: string;
        font_family: string;
      }>(
        "select theme_mode,phone,font_family from public.restaurants where id=$1",
        [a],
      );
      expect(r.rows[0]).toEqual({
        theme_mode: "dark",
        phone: "+49 123 456",
        font_family: "editorial",
      });
    });
  });
  it("denies cook and floor-service branding writes", async () => {
    for (const actor of [cook, waiter])
      await expect(
        asUser(actor, () =>
          db.query("select public.save_restaurant($1,$2::jsonb)", [
            a,
            JSON.stringify(settings),
          ]),
        ),
      ).rejects.toThrow(/Not authorized/);
  });
  it("rejects unsupported theme values and unsafe logo schemes", async () => {
    await expect(
      asUser(owner, () =>
        db.query("select public.save_restaurant($1,$2::jsonb)", [
          a,
          JSON.stringify({ ...settings, theme_mode: "unknown" }),
        ]),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(owner, () =>
        db.query("select public.save_restaurant($1,$2::jsonb)", [
          a,
          JSON.stringify({ ...settings, logo_url: "javascript:alert(1)" }),
        ]),
      ),
    ).rejects.toThrow(/logo URL/);
  });
  it("exposes only public presentation fields before guest sign-in", async () => {
    await db.exec("begin;set local role anon;");
    try {
      const r = await db.query<{ brand: Record<string, unknown> }>(
        "select public.get_public_branding(null,$1) brand",
        [token],
      );
      expect(r.rows[0].brand.name).toBe("Restaurant A");
      expect(r.rows[0].brand).not.toHaveProperty("plan_id");
      expect(r.rows[0].brand).not.toHaveProperty("access_token");
      const invalid = await db.query<{ brand: null }>(
        "select public.get_public_branding(null,$1) brand",
        [id(999)],
      );
      expect(invalid.rows[0].brand).toBeNull();
    } finally {
      await db.exec("rollback");
    }
  });
  it("keeps staff email directory private from cooks and guests", async () => {
    for (const actor of [cook, waiter, guest])
      await expect(
        asUser(actor, () =>
          db.query("select * from public.list_staff($1)", [a]),
        ),
      ).rejects.toThrow(/Not authorized/);
    await asUser(owner, async () => {
      const r = await db.query<{ email: string }>(
        "select * from public.list_staff($1)",
        [a],
      );
      expect(r.rows.some((r) => r.email === "cook@example.com")).toBe(true);
    });
  });
  it("allows admins to manage operational staff but not promote administrators", async () => {
    await db.query(
      "insert into public.memberships(restaurant_id,user_id,role) values($1,$2,'admin')",
      [a, platform],
    );
    try {
      await asUser(platform, async () => {
        await db.query(
          "select public.add_staff($1,'cook@example.com','waiter')",
          [a],
        );
        const r = await db.query<{ role: string }>(
          "select role from public.memberships where restaurant_id=$1 and user_id=$2",
          [a, cook],
        );
        expect(r.rows[0].role).toBe("waiter");
      });
      await expect(
        asUser(platform, () =>
          db.query("select public.add_staff($1,'waiter@example.com','admin')", [
            a,
          ]),
        ),
      ).rejects.toThrow(/Not authorized/);
      await expect(
        asUser(platform, () =>
          db.query("select public.add_staff($1,'owner@example.com','cook')", [
            a,
          ]),
        ),
      ).rejects.toThrow(/Only the owner/);
    } finally {
      await db.query(
        "delete from public.memberships where restaurant_id=$1 and user_id=$2",
        [a, platform],
      );
    }
  });
});

describe("expanded restaurant customization", () => {
  const customization = {
    name: "Restaurant A",
    brand_color: "#53634b",
    heading_font: "friendly",
    density: "compact",
    show_avatars: false,
    welcome_title: "A seat at our table",
    welcome_message: "Freshly made for you.",
    cover_url: "https://example.com/cover.webp",
  };
  it("persists presentation choices and returns them in the safe public profile", async () => {
    await asUser(owner, async () => {
      await db.query("select public.save_restaurant($1,$2::jsonb)", [
        a,
        JSON.stringify(customization),
      ]);
      const result = await db.query<{ brand: Record<string, unknown> }>(
        "select public.get_public_branding('restaurant-a') brand",
      );
      expect(result.rows[0].brand).toMatchObject({
        heading_font: "friendly",
        density: "compact",
        show_avatars: false,
        welcome_title: "A seat at our table",
        cover_url: "https://example.com/cover.webp",
      });
      expect(result.rows[0].brand).not.toHaveProperty("plan_id");
      await db.query("select public.save_restaurant($1,$2::jsonb)", [
        a,
        JSON.stringify({ name: "Restaurant A", brand_color: "#53634b" }),
      ]);
      const preserved = await db.query<{ brand: Record<string, unknown> }>(
        "select public.get_public_branding('restaurant-a') brand",
      );
      expect(preserved.rows[0].brand.cover_url).toBe(customization.cover_url);
      await db.query("select public.save_restaurant($1,$2::jsonb)", [
        a,
        JSON.stringify({ ...customization, cover_url: "" }),
      ]);
      const cleared = await db.query<{ brand: Record<string, unknown> }>(
        "select public.get_public_branding('restaurant-a') brand",
      );
      expect(cleared.rows[0].brand.cover_url).toBeNull();
    });
  });
  it("rejects unsafe covers, invalid layouts, and oversized welcome copy", async () => {
    for (const invalid of [
      { cover_url: "javascript:alert(1)" },
      { density: "invalid" },
      { heading_font: "invalid" },
      { welcome_message: "x".repeat(501) },
    ]) {
      await expect(
        asUser(owner, () =>
          db.query("select public.save_restaurant($1,$2::jsonb)", [
            a,
            JSON.stringify({ ...customization, ...invalid }),
          ]),
        ),
      ).rejects.toThrow();
    }
  });
  it("prevents changes to another tenant's customization", async () => {
    await expect(
      asUser(otherOwner, () =>
        db.query("select public.save_restaurant($1,$2::jsonb)", [
          a,
          JSON.stringify(customization),
        ]),
      ),
    ).rejects.toThrow(/Not authorized/);
  });
  it("provides the advertised enterprise capacity", async () => {
    const r = await db.query(
      "select table_limit,staff_limit,menu_limit from public.plans where id='enterprise'",
    );
    expect(r.rows[0]).toEqual({
      table_limit: 200,
      staff_limit: 100,
      menu_limit: 2000,
    });
  });
});

describe("platform catalogue and transparent reporting", () => {
  const planData = {
    name: "Verification",
    table_limit: 20,
    staff_limit: 12,
    menu_limit: 150,
    monthly_price_cents: 7500,
    currency: "EUR",
    description: "Test package",
    description_tr: "Test paketi",
    published: true,
  };
  it("denies restaurant owners analytics and catalogue administration", async () => {
    for (const [sql, args] of [
      ["select public.platform_analytics(30)", []],
      [
        "select public.platform_save_plan('verify',$1::jsonb,array['guest_ordering'])",
        [JSON.stringify(planData)],
      ],
      [
        "select public.platform_save_feature('verify_feature','Example','Örnek','')",
        [],
      ],
    ] as [string, unknown[]][]) {
      await expect(asUser(owner, () => db.query(sql, args))).rejects.toThrow(
        /Not authorized/,
      );
    }
  });
  it("publishes editable prices and features with before/after audit data", async () => {
    await asUser(platform, async () => {
      await db.query(
        "select public.platform_save_feature('verify_feature','Example','Örnek','Catalogue only')",
      );
      await db.query(
        "select public.platform_save_plan('verify',$1::jsonb,array['guest_ordering','verify_feature'])",
        [JSON.stringify(planData)],
      );
      const result = await db.query<{
        plans: {
          id: string;
          monthly_price_cents: number;
          features: { code: string }[];
        }[];
      }>("select public.get_public_plans() plans");
      const plan = result.rows[0].plans.find((p) => p.id === "verify");
      expect(plan?.monthly_price_cents).toBe(7500);
      expect(plan?.features.map((f) => f.code)).toEqual([
        "guest_ordering",
        "verify_feature",
      ]);
      await db.query(
        "select public.platform_save_plan('verify',$1::jsonb,array['guest_ordering'])",
        [
          JSON.stringify({
            ...planData,
            monthly_price_cents: 8000,
            published: false,
          }),
        ],
      );
      const hidden = await db.query<{ plans: { id: string }[] }>(
        "select public.get_public_plans() plans",
      );
      expect(hidden.rows[0].plans.some((p) => p.id === "verify")).toBe(false);
      const audit = await db.query<{
        before_data: { plan: { monthly_price_cents: number } };
        after_data: { plan: { monthly_price_cents: number } };
      }>(
        "select before_data,after_data from public.platform_audit where entity='verify' order by id desc limit 1",
      );
      expect(audit.rows[0].before_data.plan.monthly_price_cents).toBe(7500);
      expect(audit.rows[0].after_data.plan.monthly_price_cents).toBe(8000);
    });
  });
  it("rejects negative prices and unknown feature codes", async () => {
    await expect(
      asUser(platform, () =>
        db.query(
          "select public.platform_save_plan('verify',$1::jsonb,array['guest_ordering'])",
          [JSON.stringify({ ...planData, monthly_price_cents: -1 })],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(platform, () =>
        db.query(
          "select public.platform_save_plan('verify',$1::jsonb,array['not_real'])",
          [JSON.stringify(planData)],
        ),
      ),
    ).rejects.toThrow(/Unknown feature/);
  });
  it("enforces disabled ordering on the server", async () => {
    await asUser(platform, async () => {
      await db.query(
        "select public.platform_save_plan('verify',$1::jsonb,array[]::text[])",
        [JSON.stringify(planData)],
      );
      await db.query(
        "select public.platform_update_restaurant($1,'verify',true)",
        [a],
      );
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: guest, is_anonymous: true }),
      ]);
      await expect(place()).rejects.toThrow(/Feature is not included/);
    });
  });
  it("reports source-backed totals by currency and rejects unsupported periods", async () => {
    const oid = id(800);
    await db.query(
      "insert into public.orders(id,restaurant_id,session_id,customer_id,table_name,status,idempotency_key,preparing_at,ready_at,served_at) values($1,$2,$3,$4,'Test','served',$5,now()-interval '10 minutes',now()-interval '5 minutes',now())",
      [oid, a, session, guest, id(801)],
    );
    await db.query(
      "insert into public.order_items(restaurant_id,order_id,menu_item_id,name,price_cents,quantity,cancelled) values($1,$2,$3,'Served',1000,2,false),($1,$2,$3,'Cancelled line',99900,1,true)",
      [a, oid, menuA],
    );
    try {
      await asUser(platform, async () => {
        const result = await db.query<{
          report: {
            orders: number;
            served: number;
            avg_preparation_minutes: number;
            currency_totals: { currency: string; served_value_cents: number }[];
            daily: unknown[];
          };
        }>("select public.platform_analytics(7) report");
        expect(result.rows[0].report.orders).toBe(1);
        expect(result.rows[0].report.served).toBe(1);
        expect(result.rows[0].report.avg_preparation_minutes).toBe(5);
        expect(result.rows[0].report.currency_totals).toEqual([
          { currency: "EUR", served_orders: 1, served_value_cents: 2000 },
        ]);
        expect(result.rows[0].report.daily).toHaveLength(7);
      });
      await expect(
        asUser(platform, () =>
          db.query("select public.platform_analytics(365)"),
        ),
      ).rejects.toThrow(/Choose 7/);
    } finally {
      await db.query("delete from public.order_items where order_id=$1", [oid]);
      await db.query("delete from public.orders where id=$1", [oid]);
    }
  });
  it("keeps analytics and the audit log private from anonymous visitors", async () => {
    await db.exec("begin;set local role anon");
    try {
      await expect(
        db.query("select public.platform_analytics(30)"),
      ).rejects.toThrow();
    } finally {
      await db.exec("rollback");
    }
    await db.exec("begin;set local role anon");
    try {
      const result = await db.query<{ plans: unknown[] }>(
        "select public.get_public_plans() plans",
      );
      expect(result.rows[0].plans).toHaveLength(3);
    } finally {
      await db.exec("rollback");
    }
  });
});

describe("Tenant identity and personnel", () => {
  it("saves every interface/font and exposes the default language in public branding", async () => {
    await asUser(owner, async () => {
      const styles = [
        "classic",
        "soft",
        "minimal",
        "editorial",
        "bistro",
        "cafe",
        "botanical",
        "midnight",
        "coastal",
        "playful",
      ];
      const fonts = [
        "modern",
        "editorial",
        "friendly",
        "geometric",
        "humanist",
        "mono",
        "classic",
        "rounded",
        "luxury",
        "condensed",
      ];
      for (let i = 0; i < styles.length; i++)
        await db.query("select public.save_restaurant($1,$2::jsonb)", [
          a,
          JSON.stringify({
            name: "Restaurant A",
            brand_color: "#336699",
            interface_style: styles[i],
            font_family: fonts[i],
            heading_font: fonts[i],
            default_language: "tr",
          }),
        ]);
      const result = await db.query<{
        brand: { default_language: string; interface_style: string };
      }>("select public.get_public_branding('restaurant-a',null) brand");
      expect(result.rows[0].brand.default_language).toBe("tr");
      expect(result.rows[0].brand.interface_style).toBe("playful");
    });
  });
  it("saves a verified employee and revokes access when removed", async () => {
    await asUser(owner, async () => {
      const result = await db.query<{ eid: string }>(
        "select public.save_employee($1,null,$2::jsonb) eid",
        [
          a,
          JSON.stringify({
            name: "Chef",
            email: "cook@example.com",
            phone: "+49 1234",
            employee_id: "C-01",
            role: "cook",
          }),
        ],
      );
      const eid = result.rows[0].eid;
      expect(
        (
          await db.query("select * from public.employee_profiles where id=$1", [
            eid,
          ])
        ).rows,
      ).toHaveLength(1);
      await db.query("select public.remove_employee($1,$2)", [a, eid]);
      expect(
        (
          await db.query(
            "select * from public.memberships where restaurant_id=$1 and user_id=$2",
            [a, cook],
          )
        ).rows,
      ).toHaveLength(0);
      await db.query("select public.save_employee($1,$2,$3::jsonb)", [
        a,
        eid,
        JSON.stringify({
          name: "Chef",
          email: "cook@example.com",
          employee_id: "C-01",
          role: "cook",
        }),
      ]);
      expect(
        (
          await db.query(
            "select * from public.memberships where restaurant_id=$1 and user_id=$2",
            [a, cook],
          )
        ).rows,
      ).toHaveLength(1);
    });
  });
  it("denies employee management to cooks and across restaurants", async () => {
    const data = JSON.stringify({
      name: "Staff",
      email: "staff@example.com",
      employee_id: "S-01",
      role: "waiter",
    });
    await expect(
      asUser(cook, () =>
        db.query("select public.save_employee($1,null,$2::jsonb)", [a, data]),
      ),
    ).rejects.toThrow(/Not authorized/);
    await expect(
      asUser(otherOwner, () =>
        db.query("select public.save_employee($1,null,$2::jsonb)", [a, data]),
      ),
    ).rejects.toThrow(/Not authorized/);
    await expect(
      asUser(owner, () =>
        db.query("select public.save_employee($1,null,$2::jsonb)", [
          a,
          JSON.stringify({
            name: "Owner",
            email: "owner@example.com",
            employee_id: "O-01",
            role: "cook",
          }),
        ]),
      ),
    ).rejects.toThrow(/owner account/);
  });
  it("claims pending access only for a confirmed email and keeps personnel data tenant private", async () => {
    const pending = id(801),
      eid = id(802);
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'pending@example.com',null)",
      [pending],
    );
    await db.query(
      "insert into public.employee_profiles(id,restaurant_id,name,email,employee_id,role) values($1,$2,'Pending','pending@example.com','P-01','cook')",
      [eid, a],
    );
    try {
      await asUser(pending, async () => {
        await db.exec("select public.claim_employee_access()");
        expect(
          (
            await db.query(
              "select * from public.memberships where user_id=$1",
              [pending],
            )
          ).rows,
        ).toHaveLength(0);
      });
      await db.query(
        "update auth.users set email_confirmed_at=now() where id=$1",
        [pending],
      );
      await asUser(pending, async () => {
        await db.exec("select public.claim_employee_access()");
        expect(
          (
            await db.query(
              "select * from public.memberships where user_id=$1",
              [pending],
            )
          ).rows,
        ).toHaveLength(1);
        expect(
          (await db.query("select * from public.employee_profiles")).rows,
        ).toHaveLength(1);
      });
      await asUser(otherOwner, async () =>
        expect(
          (
            await db.query(
              "select * from public.employee_profiles where restaurant_id=$1",
              [a],
            )
          ).rows,
        ).toHaveLength(0),
      );
    } finally {
      await db.query("delete from public.employee_profiles where id=$1", [eid]);
      await db.query("delete from auth.users where id=$1", [pending]);
    }
  });
  it("archives items without deleting historical data and allows restoration", async () => {
    await asUser(owner, async () => {
      await db.query(
        "select public.manage_restaurant_resource($1,'menu',$2,null,true)",
        [a, menuA],
      );
      expect(
        (
          await db.query<{ archived: boolean; available: boolean }>(
            "select archived,available from public.menu_items where id=$1",
            [menuA],
          )
        ).rows[0],
      ).toEqual({ archived: true, available: false });
      await db.query(
        "select public.manage_restaurant_resource($1,'menu',$2,null,false)",
        [a, menuA],
      );
      expect(
        (
          await db.query<{ archived: boolean }>(
            "select archived from public.menu_items where id=$1",
            [menuA],
          )
        ).rows[0].archived,
      ).toBe(false);
      await db.query(
        "select public.manage_restaurant_resource($1,'table',$2,null,true)",
        [a, ta],
      );
      expect(
        (
          await db.query<{ active: boolean }>(
            "select active from public.dining_tables where id=$1",
            [ta],
          )
        ).rows[0].active,
      ).toBe(false);
    });
  });
});
