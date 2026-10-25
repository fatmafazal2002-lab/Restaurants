"use client";
import { translateText as tx } from "@/lib/translation";

import { PreferenceControls, usePreferences } from "./preferences";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/utils";
import { portals, portalTitle, type Portal } from "@/lib/portals";
import {
  brandingAttributes,
  brandingStyle,
  type Branding,
} from "@/lib/branding";
import { RoleAvatar } from "./role-avatar";
import { Button } from "./ui/button";
import { Field } from "./shared";
export function PortalLogin({
  portal,
  brand,
  locale,
  setLocale,
}: {
  portal: Portal;
  brand?: Branding | null;
  locale: "en" | "de" | "tr";
  setLocale: (l: "en" | "de" | "tr") => void;
}) {
  usePreferences();

  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const german = locale === "de";
  const copy =
    portal === "admin"
      ? german
        ? "Ein Ort für Ihr ganzes Restaurant."
        : tx("One place for your whole restaurant.")
      : portal === "kitchen"
        ? german
          ? "Gute Gerichte. Ein ruhiger Service."
          : tx("Great dishes. A calmer service.")
        : german
          ? "Für die Menschen an jedem Tisch."
          : tx("For the people at every table.");
  const description =
    portal === "admin"
      ? german
        ? "Speisekarte, Tische, Team und Markenauftritt verwalten."
        : tx("Manage your menu, tables, people, and restaurant identity.")
      : portal === "kitchen"
        ? german
          ? "Bestellungen sehen, Zubereitung starten und Gerichte freigeben."
          : tx(
              "See incoming tickets, start preparation, and send dishes to the floor.",
            )
        : german
          ? "Fertige Gerichte servieren und Gästeanfragen beantworten."
          : tx("Deliver ready dishes and respond to guests who need a hand.");
  return (
    <main
      className="portal-login themed"
      data-theme={brand?.theme_mode || "light"}
      data-style={brand?.interface_style || "classic"}
      style={brandingStyle(brand)}
      {...brandingAttributes(brand)}
    >
      <header className="portal-login-header">
        <a className="wordmark" href="/">
          {brand?.logo_url ? (
            <img src={brand.logo_url} alt={brand.name} />
          ) : (
            <>
              {brand?.name || "mise"}
              <span>✳</span>
            </>
          )}
        </a>
        <span>{brand?.name || tx("A better service, together.")}</span>
        <PreferenceControls />
      </header>
      <div className="portal-login-grid">
        <motion.section
          className="portal-story"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="avatar-stage">
            <RoleAvatar role={portal} size={180} />
            <span className="avatar-spark">✳</span>
          </div>
          <div className="eyebrow">{portalTitle(portal, german)}</div>
          <h1>{copy}</h1>
          <p>{description}</p>
          <div className="portal-assurance">
            <ShieldCheck size={17} />
            {german
              ? "Persönliches Konto. Zugriff nach Ihrer Teamrolle."
              : tx("Your own account. Access matched to your team role.")}
          </div>
        </motion.section>
        <motion.section
          className="panel portal-form"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <nav className="portal-choices" aria-label={tx("Workspace login")}>
            {portals.map((p) => (
              <a
                key={p}
                aria-current={p === portal ? "page" : undefined}
                href={`/login/${p}${brand?.slug ? `?restaurant=${encodeURIComponent(brand.slug)}` : ""}`}
              >
                <RoleAvatar role={p} size={42} />
                <span>{portalTitle(p, german)}</span>
              </a>
            ))}
          </nav>
          <h2>
            {register
              ? german
                ? "Ihr persönliches Konto"
                : tx("Create your own account")
              : german
                ? "Willkommen zurück"
                : tx("Welcome back")}
          </h2>
          <p>
            {portalTitle(portal, german)} ·{" "}
            {register
              ? german
                ? "Registrieren"
                : tx("Register")
              : german
                ? "Anmelden"
                : tx("Sign in")}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError("");
              setMessage("");
              const f = new FormData(e.currentTarget);
              try {
                if (!supabase)
                  throw new Error(
                    german
                      ? "Supabase ist noch nicht verbunden."
                      : tx("Supabase is not connected yet."),
                  );
                const email = String(f.get("email")).trim(),
                  password = String(f.get("password"));
                const { error } = register
                  ? await supabase.auth.signUp({
                      email,
                      password,
                      options: {
                        data: { display_name: String(f.get("name")) },
                        emailRedirectTo: `${location.origin}/login/${portal}${brand?.slug ? `?restaurant=${encodeURIComponent(brand.slug)}` : ""}`,
                      },
                    })
                  : await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
                if (register)
                  setMessage(
                    german
                      ? "Bestätigen Sie Ihre E-Mail und melden Sie sich danach an."
                      : tx("Confirm your email, then sign in."),
                  );
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {register && (
              <Field label={german ? "Ihr Name" : tx("Your name")}>
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              </Field>
            )}
            <Field label={tx("Email")}>
              <input name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label={german ? "Passwort" : tx("Password")}>
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={8}
                required
              />
            </Field>
            {portal !== "admin" && (
              <p className="role-note">
                {german
                  ? "Nach der Registrierung muss ein Administrator Ihre E-Mail dem Restaurant und Ihrer Teamrolle zuweisen."
                  : tx(
                      "After registration, an administrator must assign your email to the restaurant and your staff role.",
                    )}
              </p>
            )}
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="role-note">
                {message}
              </p>
            )}
            <Button disabled={busy || !supabase} type="submit">
              {busy ? (
                <Loader2 size={17} className="spin" />
              ) : register ? (
                german ? (
                  "Konto erstellen"
                ) : (
                  tx("Create account")
                )
              ) : german ? (
                "Anmelden"
              ) : (
                tx("Sign in")
              )}
              <ArrowRight size={17} />
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setRegister(!register);
                setError("");
                setMessage("");
              }}
            >
              {register
                ? german
                  ? "Bereits registriert? Anmelden"
                  : tx("Already registered? Sign in")
                : german
                  ? "Neu hier? Konto erstellen"
                  : tx("New here? Create an account")}
            </Button>
          </form>
        </motion.section>
      </div>
      {brand && (brand.address || brand.phone) && (
        <footer>
          <span>{brand.name}</span>
          <p>{brand.address}</p>
          {brand.phone && (
            <a href={`tel:${brand.phone.replace(/[^+0-9]/g, "")}`}>
              {brand.phone}
            </a>
          )}
        </footer>
      )}
    </main>
  );
}
