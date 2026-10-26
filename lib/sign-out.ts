import { supabase } from "./supabase";
/** Sign out this browser without refreshing the old user's workspace. */
export async function signOutCurrentBrowser(client = supabase) {
  if (!client) return;
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw error;
}
