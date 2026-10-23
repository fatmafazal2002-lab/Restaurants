import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
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
 create table auth.users(id uuid primary key,email text,is_anonymous boolean default false);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth,public to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated;grant insert,select,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 create publication supabase_realtime;`);
  await db.exec(
    readFileSync("supabase/migrations/202610220001_core.sql", "utf8"),
  );
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
