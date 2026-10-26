"use client";
import {ToastBridge,useNotifications} from "./notifications";
import { useEffect, useState } from "react";
import { translateText as tx } from "@/lib/translation";
import { usePreferences, PreferenceControls } from "./preferences";
import {
  interfaces,
  fontOptions,
  type FontFamily,
  type InterfaceStyle,
} from "@/lib/appearance-options";
import { brandingStyle } from "@/lib/branding";
import { rpc, supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/utils";
import { RESTAURANT_SLUG_PATTERN } from "@/lib/restaurant-slug";
import { RoleAvatar } from "./role-avatar";
import { SignOutButton } from "./sign-out-button";
import { Button } from "./ui/button";
import { Field } from "./shared";
export function RestaurantOnboarding() {
  const { locale, setLocale } = usePreferences();
  const {notify}=useNotifications();
  const [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [created, setCreated] = useState<string | null>(null),
    [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    slug: "",
    address: "",
    phone: "",
    logo_url: "",
    brand_color: "#53634b",
    accent_color: "#b58a56",
    font_family: "modern" as FontFamily,
    heading_font: "editorial" as FontFamily,
    interface_style: "classic" as InterfaceStyle,
    theme_mode: "light",
    default_language: locale,
    welcome_title: "",
    welcome_message: "",
  });
  const [filePreview, setFilePreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const change = (key: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <div className="tenant-onboarding">
      <ToastBridge message={error} kind="error"/>
      <header>
        <strong>{tx("Your restaurant. Your signature.")}</strong>
        <PreferenceControls />
        <SignOutButton />
      </header>
      <main>
        <section>
          <p className="eyebrow">
            {tx("Restaurant setup")} · {step}/3
          </p>
          <h1>
            {tx(
              step === 1
                ? "Tell us about your restaurant"
                : step === 2
                  ? "Choose your restaurant's look"
                  : "Make the welcome yours",
            )}
          </h1>
          <p>
            {tx(
              "Your logo, identity and preferences will carry through every restaurant screen.",
            )}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              if (step < 3) {
                setStep((s) => s + 1);
                notify(tx("Step complete"));
                return;
              }
              setBusy(true);
              try {
                if (
                  file &&
                  (file.size > 10 * 1024 * 1024 ||
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      file.type,
                    ))
                )
                  throw new Error(
                    tx("Choose a PNG, JPEG or WebP image under 10 MB."),
                  );
                const id =
                  created ??
                  (await rpc<string>("onboard_restaurant", {
                    p_name: draft.name,
                    p_slug: draft.slug,
                    p_data: draft,
                  }));
                setCreated(id);
                let logo = draft.logo_url;
                if (file) {
                  const path = `${id}/logo-${crypto.randomUUID()}.${file.type.split("/")[1]}`;
                  const { error } = await supabase!.storage
                    .from("restaurant-media")
                    .upload(path, file);
                  if (error) throw error;
                  logo = supabase!.storage
                    .from("restaurant-media")
                    .getPublicUrl(path).data.publicUrl;
                }
                await rpc("save_restaurant", {
                  p_restaurant: id,
                  p_data: { ...draft, logo_url: logo },
                });
                setLocale(draft.default_language);
                location.replace(`/r/${encodeURIComponent(draft.slug)}/admin`);
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {step === 1 && (
              <>
                <Field label={tx("Restaurant name")}>
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={draft.name}
                    onChange={(e) => change("name", e.target.value)}
                  />
                </Field>
                <Field label={tx("Restaurant identifier")}>
                  <input
                    required
                    pattern={RESTAURANT_SLUG_PATTERN}
                    minLength={3}
                    maxLength={61}
                    value={draft.slug}
                    onChange={(e) =>
                      change("slug", e.target.value.toLowerCase())
                    }
                  />
                  <small>
                    {tx(
                      "Use lowercase letters, numbers and hyphens. Example: greenbites.",
                    )}
                  </small>
                </Field>
                <Field label={tx("Address")}>
                  <input
                    value={draft.address}
                    onChange={(e) => change("address", e.target.value)}
                  />
                </Field>
                <Field label={tx("Phone number")}>
                  <input
                    type="tel"
                    maxLength={40}
                    value={draft.phone}
                    onChange={(e) => change("phone", e.target.value)}
                  />
                </Field>
              </>
            )}
            {step === 2 && (
              <>
                <div className="interface-options">
                  {interfaces.map((option) => (
                    <button
                      type="button"
                      key={option.id}
                      aria-pressed={draft.interface_style === option.id}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          interface_style: option.id,
                          font_family: option.font,
                          heading_font: option.heading,
                          theme_mode: option.mode,
                          brand_color: option.color,
                          accent_color: option.accent,
                        }))
                      }
                    >
                      <div
                        className={`template-swatch template-${option.id}`}
                        style={{
                          background:
                            option.mode === "dark" ? "#202b24" : "#f6f3eb",
                          color: option.color,
                        }}
                      >
                        <span />
                        <i />
                        <i />
                        <i />
                      </div>
                      <strong>{tx(option.name)}</strong>
                    </button>
                  ))}
                </div>
                <div className="form-grid">
                  <Field label={tx("Brand color")}>
                    <input
                      type="color"
                      value={draft.brand_color}
                      onChange={(e) => change("brand_color", e.target.value)}
                    />
                  </Field>
                  <Field label={tx("Accent color")}>
                    <input
                      type="color"
                      value={draft.accent_color}
                      onChange={(e) => change("accent_color", e.target.value)}
                    />
                  </Field>
                  <Field label={tx("Typography")}>
                    <select
                      value={draft.font_family}
                      onChange={(e) => change("font_family", e.target.value)}
                    >
                      {fontOptions.map((f) => (
                        <option key={f.id} value={f.id}>
                          {tx(f.name)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={tx("Heading font")}>
                    <select
                      value={draft.heading_font}
                      onChange={(e) => change("heading_font", e.target.value)}
                    >
                      {fontOptions.map((f) => (
                        <option key={f.id} value={f.id}>
                          {tx(f.name)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={tx("Default language")}>
                    <select
                      value={draft.default_language}
                      onChange={(e) =>
                        change("default_language", e.target.value)
                      }
                    >
                      <option value="en">English</option>
                      <option value="de">Deutsch</option>
                      <option value="tr">Türkçe</option>
                    </select>
                  </Field>
                  <Field label={tx("Color mode")}>
                    <select
                      value={draft.theme_mode}
                      onChange={(e) => change("theme_mode", e.target.value)}
                    >
                      <option value="light">{tx("Light")}</option>
                      <option value="dark">{tx("Dark")}</option>
                      <option value="system">{tx("Follow device")}</option>
                    </select>
                  </Field>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <Field label={tx("Upload logo (PNG, JPEG, WebP)")}>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                </Field>
                {file && <p>{file.name}</p>}
                <Field label={tx("Logo URL")}>
                  <input
                    type="url"
                    value={draft.logo_url}
                    onChange={(e) => change("logo_url", e.target.value)}
                  />
                </Field>
                <Field label={tx("Welcome heading")}>
                  <input
                    maxLength={120}
                    value={draft.welcome_title}
                    onChange={(e) => change("welcome_title", e.target.value)}
                  />
                </Field>
                <Field label={tx("Welcome message")}>
                  <textarea
                    maxLength={500}
                    value={draft.welcome_message}
                    onChange={(e) => change("welcome_message", e.target.value)}
                  />
                </Field>
                <p>
                  {tx(
                    "You can change these choices later in your restaurant settings.",
                  )}
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <div className="settings-actions">
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !!created}
                  onClick={() => setStep((s) => s - 1)}
                >
                  {tx("Back")}
                </Button>
              )}
              <Button disabled={busy}>
                {busy
                  ? tx("Saving…")
                  : step === 3
                    ? tx("Create restaurant")
                    : tx("Continue")}
              </Button>
            </div>
          </form>
        </section>
        <aside
          className="themed onboarding-preview"
          data-theme={draft.theme_mode}
          data-style={draft.interface_style}
          style={brandingStyle({
            ...draft,
            theme_mode: draft.theme_mode as "light" | "dark" | "system",
          })}
        >
          <span className="eyebrow">{tx("Live preview")}</span>
          <section className="panel">
            {filePreview || draft.logo_url ? (
              <img
                className="onboarding-logo"
                src={filePreview || draft.logo_url}
                alt=""
              />
            ) : (
              <RoleAvatar role="guest" size={90} />
            )}
            <h1>{draft.name || tx("Your restaurant")}</h1>
            <h2>{draft.welcome_title || tx("Welcome to the table.")}</h2>
            <p>
              {draft.welcome_message ||
                tx("Take your time. Find your favorite.")}
            </p>
            <Button type="button">{tx("Explore the menu")}</Button>
            <div className="preview-mini-grid">
              <div />
              <div />
              <div />
            </div>
            <small>{draft.address}</small>
          </section>
        </aside>
      </main>
    </div>
  );
}
