import { randomBytes } from "node:crypto";
import { authenticatedClients, apiFailure } from "@/lib/server-auth";
export async function POST(request: Request) {
  let cleanup: {
    client: Awaited<ReturnType<typeof authenticatedClients>>["client"];
    id: string;
    restaurant: string;
  } | null = null;
  let created: string | null = null;
  let adminClient:
    Awaited<ReturnType<typeof authenticatedClients>>["admin"] | null = null;
  try {
    const { client, admin } = await authenticatedClients(request);
    adminClient = admin;
    const body = await request.json();
    const restaurant = String(body.restaurant_id || ""),
      email = String(body.email || "")
        .trim()
        .toLowerCase(),
      role = String(body.role || "");
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      !["cook", "waiter"].includes(role)
    )
      throw new Error("Check the email address and employee role.");
    const { data: allowed, error: permissionError } = await client.rpc(
      "has_role",
      { rid: restaurant, roles: ["owner", "admin"] },
    );
    if (permissionError || !allowed) throw new Error("Not authorized");
    // Reserve an employee slot transactionally before creating an Auth identity.
    const { data: existing, error: existingError } = await client
      .from("employee_profiles")
      .select("id,user_id,archived")
      .eq("restaurant_id", restaurant)
      .eq("email", email)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing && !existing.archived)
      throw new Error("This employee is already in your team.");
    const employeeId = String(
      body.employee_id || `EMP-${randomBytes(4).toString("hex").toUpperCase()}`,
    );
    const profile = {
      name: email.split("@")[0].slice(0, 100),
      email,
      employee_id: employeeId,
      phone: "",
      role,
    };
    const { data: id, error: saveError } = await client.rpc("save_employee", {
      p_restaurant: restaurant,
      p_id: existing?.id ?? null,
      p_data: profile,
    });
    if (saveError) throw new Error(saveError.message);
    const { data: saved, error: readError } = await client
      .from("employee_profiles")
      .select("user_id")
      .eq("id", id)
      .single();
    if (readError) throw new Error(readError.message);
    if (saved.user_id)
      return Response.json(
        { id, email, existing: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    cleanup = { client, id, restaurant };
    const password = `Mise!${randomBytes(18).toString("base64url")}9`;
    const { data: newUser, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createError) {
      await client.rpc("remove_employee", {
        p_restaurant: restaurant,
        p_id: id,
      });
      throw new Error(
        "This email may already have an account. Ask the employee to verify it and use their existing password.",
      );
    }
    created = newUser.user.id;
    const { error: assignError } = await client.rpc("save_employee", {
      p_restaurant: restaurant,
      p_id: id,
      p_data: profile,
    });
    if (assignError) throw new Error(assignError.message);
    const { error: setupError } = await admin
      .from("employee_profiles")
      .update({ setup_required: true })
      .eq("id", id)
      .eq("user_id", created);
    if (setupError) throw new Error(setupError.message);
    created = null;
    cleanup = null;
    return Response.json(
      { id, email, password, existing: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (cleanup)
      await cleanup.client.rpc("remove_employee", {
        p_restaurant: cleanup.restaurant,
        p_id: cleanup.id,
      });
    if (created && adminClient)
      await adminClient.auth.admin.deleteUser(created);
    return apiFailure(error);
  }
}
