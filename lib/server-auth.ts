import "server-only";
import { createClient } from "@supabase/supabase-js";
export async function authenticatedClients(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !service)
    throw new Error("Employee account provisioning is not configured.");
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) throw new Error("Sign in required");
  const client = createClient(url, key, {
    global: { headers: { Authorization: token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token.slice(7));
  if (error || !data.user || data.user.is_anonymous)
    throw new Error("Sign in required");
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { client, admin, user: data.user, token: token.slice(7) };
}
export function apiFailure(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
  return Response.json(
    { error: message },
    {
      status: message === "Sign in required" ? 401 : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
