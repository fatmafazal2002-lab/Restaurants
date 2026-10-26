"use client";
import { translateText as tx } from "@/lib/translation";
import { usePreferences } from "./preferences";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SignOutButton } from "./sign-out-button";
export function SessionAccess() {
  usePreferences();

  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(!!session?.user && !session.user.is_anonymous),
    );
    return () => subscription.unsubscribe();
  }, []);
  return (
    <div className="login-entrances">
      <a className="platform-login-link" href="/login/platform">
        {tx("App administrator login")}
      </a>
      {signedIn ? (
        <div className="landing-session">
          <a href="/admin">{tx("Restaurant workspace")}</a>
          <SignOutButton redirect="/" />
        </div>
      ) : (
        <a className="marketing-login" href="/login/admin">
          {tx("Restaurant administrator login")}
        </a>
      )}
    </div>
  );
}
