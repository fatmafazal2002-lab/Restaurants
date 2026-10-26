"use client";
import { translateText as tx } from "@/lib/translation";
import { usePreferences } from "./preferences";

import type {SupabaseClient} from "@supabase/supabase-js";
import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { signOutCurrentBrowser } from "@/lib/sign-out";
import { errorMessage } from "@/lib/utils";
import { Button } from "./ui/button";
export function SignOutButton({
  redirect = "/login/admin",
  label = tx("Sign out"),
  client,
}: {
  client?:SupabaseClient|null;
  redirect?: string;
  label?: string;
}) {
  usePreferences();

  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <span className="signout-control">
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await signOutCurrentBrowser(client);
            window.location.replace(redirect);
          } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 size={15} className="spin" /> : <LogOut size={15} />}{" "}
        {busy ? tx("Signing out…") : label}
      </Button>
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
