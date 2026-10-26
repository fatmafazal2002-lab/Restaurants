import { createClient } from "@supabase/supabase-js";
import { restaurantAuthOptions } from "./auth-storage";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key ? createClient(url, key, { auth: restaurantAuthOptions() }) : null;
export async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  if (!supabase) throw new Error("Connect Supabase to enable this action.");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
