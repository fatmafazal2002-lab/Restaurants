import { supabase } from "./supabase";
/** Sign out this browser without refreshing the old user's workspace. */
export async function signOutCurrentBrowser() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}
