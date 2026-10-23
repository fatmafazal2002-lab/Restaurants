import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
// Opt-in: use only a disposable local Supabase project with the migration applied.
const url = process.env.TEST_DATABASE_URL;
const enabled = !!url;
const ids = {
  owner: randomUUID(),
  guest: randomUUID(),
  restaurant: randomUUID(),
  table: randomUUID(),
  session: randomUUID(),
  menu: randomUUID(),
};
let pool: Pool;
async function actor<T>(
  user: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: user, is_anonymous: user === ids.guest }),
    ]);
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
async function place(key = randomUUID()) {
  return actor(
    ids.guest,
    async (c) =>
      (
        await c.query("select public.place_order($1,$2,$3::jsonb) id", [
          ids.session,
          key,
          JSON.stringify([
            { menu_item_id: ids.menu, quantity: 1, instructions: "" },
          ]),
        ])
      ).rows[0].id as string,
  );
}
describe.skipIf(!enabled)("multi-connection PostgreSQL concurrency", () => {
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
      throw new Error(
        "Concurrency fixtures require a disposable localhost database.",
      );
    pool = new Pool({ connectionString: url, max: 5 });
    await pool.query(
      "insert into auth.users(id,email,is_anonymous) values($1,$3,false),($2,null,true)",
      [ids.owner, ids.guest, `test-${ids.owner}@example.test`],
    );
    await pool.query(
      "insert into public.restaurants(id,name,slug) values($1,'Concurrency test',$2)",
      [ids.restaurant, `test-${ids.restaurant}`],
    );
    await pool.query("insert into public.memberships values($1,$2,'owner')", [
      ids.restaurant,
      ids.owner,
    ]);
    await pool.query(
      "insert into public.dining_tables(id,restaurant_id,name) values($1,$2,'Test table')",
      [ids.table, ids.restaurant],
    );
    await pool.query(
      "insert into public.table_sessions(id,restaurant_id,table_id,customer_id) values($1,$2,$3,$4)",
      [ids.session, ids.restaurant, ids.table, ids.guest],
    );
    await pool.query(
      "insert into public.menu_items(id,restaurant_id,name,price_cents) values($1,$2,'Test dish',1000)",
      [ids.menu, ids.restaurant],
    );
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of [
      "order_items",
      "feedback",
      "orders",
      "service_requests",
      "audit_logs",
      "table_sessions",
      "menu_items",
      "dining_tables",
      "memberships",
    ])
      await pool.query(`delete from public.${table} where restaurant_id=$1`, [
        ids.restaurant,
      ]);
    await pool.query("delete from public.restaurants where id=$1", [
      ids.restaurant,
    ]);
    await pool.query("delete from auth.users where id=any($1::uuid[])", [
      [ids.owner, ids.guest],
    ]);
    await pool.end();
  });
  it("serializes duplicate submissions into one ticket", async () => {
    const key = randomUUID();
    const results = await Promise.all([place(key), place(key), place(key)]);
    expect(new Set(results).size).toBe(1);
    expect(
      (
        await pool.query(
          "select count(*)::int n from public.orders where customer_id=$1 and idempotency_key=$2",
          [ids.guest, key],
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("allows only one concurrent preparation transition", async () => {
    const id = await place();
    const transition = () =>
      actor(ids.owner, (c) =>
        c.query("select public.transition_order($1,'placed','preparing')", [
          id,
        ]),
      );
    const results = await Promise.allSettled([transition(), transition()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("serializes item editing against preparation", async () => {
    const id = await place();
    const item = (
      await pool.query("select id from public.order_items where order_id=$1", [
        id,
      ])
    ).rows[0].id;
    const results = await Promise.allSettled([
      actor(ids.guest, (c) =>
        c.query(
          "select public.edit_order_item($1,2,'Edit raced with start',false)",
          [item],
        ),
      ),
      actor(ids.owner, (c) =>
        c.query("select public.transition_order($1,'placed','preparing')", [
          id,
        ]),
      ),
    ]);
    expect(results[1].status).toBe("fulfilled");
    expect(
      (await pool.query("select status from public.orders where id=$1", [id]))
        .rows[0].status,
    ).toBe("preparing");
    await expect(
      actor(ids.guest, (c) =>
        c.query("select public.edit_order_item($1,3,'Too late',false)", [item]),
      ),
    ).rejects.toThrow(/locked/);
  });
});
