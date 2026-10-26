import { createClient } from "@supabase/supabase-js";
import { authenticatedClients, apiFailure } from "@/lib/server-auth";
export async function POST(request: Request) {
  try {
    const { client, admin, user } = await authenticatedClients(request);
    const body = await request.json();
    const password = String(body.password || "");
    if (password.length < 12 || password.length > 128)
      throw new Error("Use a new password with 12–128 characters.");
    const { data: profile, error: lookup } = await client.rpc("employee_setup");
    if (lookup || !profile) throw new Error("No employee setup is pending.");
    const name = String(body.name || "").trim(),
      phone = String(body.phone || "").trim(),
      photo = body.photo_path ? String(body.photo_path) : null;
    if (!name || name.length > 100 || phone.length > 40)
      throw new Error("Check the form values and required fields.");
    const { error: personalError } = await client.rpc(
      "save_my_employee_profile",
      { p_id: profile.id, p_name: name, p_phone: phone, p_photo: photo },
    );
    if (personalError) throw new Error(personalError.message);
    const verifier = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const same = await verifier.auth.signInWithPassword({
      email: user.email!,
      password,
    });
    if (!same.error) {
      await verifier.auth.signOut({ scope: "local" });
      throw new Error(
        "Choose a password different from your temporary password.",
      );
    }
    if (same.error?.code !== "invalid_credentials")
      throw new Error("Could not verify the new password. Please try again.");
    const { error: passwordError } = await admin.auth.admin.updateUserById(
      user.id,
      { password },
    );
    if (passwordError) throw new Error(passwordError.message);
    const { error: finishError } = await admin.rpc("finish_employee_setup", {
      p_user: user.id,
      p_id: profile.id,
    });
    if (finishError) throw new Error(finishError.message);
    return Response.json(
      { slug: profile.slug, role: profile.role },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiFailure(error);
  }
}
