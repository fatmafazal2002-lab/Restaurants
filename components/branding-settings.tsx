"use client";
import { translateText as tx } from "@/lib/translation";
import { usePreferences } from "./preferences";

import { useState } from "react";
import { Paintbrush, Upload, Check } from "lucide-react";
import { rpc, supabase } from "@/lib/supabase";
import type { Restaurant } from "@/lib/types";
import { brandingAttributes, brandingStyle } from "@/lib/branding";
import { Field, type T } from "./shared";
import { RoleAvatar } from "./role-avatar";
import { Button } from "./ui/button";
export function BrandingSettings({
  restaurant,
  run,
  busy,
  t,
  locale,
}: {
  restaurant: Restaurant;
  run: (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
  busy: boolean;
  t: T;
  locale: string;
}) {
  usePreferences();

  const [draft, setDraft] = useState(restaurant);
  const de = locale === "de";
  const change = (key: keyof Restaurant, value: string | boolean) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <div className="branding-settings">
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>
              {de
                ? "Ihr Restaurant. Ihr Stil."
                : tx("Your restaurant. Your signature.")}
            </h2>
            <p>
              {de
                ? "Gilt für Administration, Küche, Service und Gäste."
                : tx(
                    "Applied across admin, kitchen, floor service, and guest screens.",
                  )}
            </p>
          </div>
          <Paintbrush size={22} />
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await run(async () => {
              const upload = async (
                field: "logo" | "cover",
                previous: string | null,
              ) => {
                const file = f.get(field) as File;
                if (!file?.size) return previous;
                if (file.size > 10 * 1024 * 1024)
                  throw new Error(
                    de
                      ? "Maximal 10 MB pro Bild."
                      : tx("Each image must be under 10 MB."),
                  );
                if (
                  !["image/png", "image/jpeg", "image/webp"].includes(file.type)
                )
                  throw new Error(tx("Choose PNG, JPEG or WebP."));
                const path = `${restaurant.id}/${field}-${crypto.randomUUID()}.${file.type.split("/")[1]}`;
                const { error } = await supabase!.storage
                  .from("restaurant-media")
                  .upload(path, file);
                if (error) throw error;
                return supabase!.storage
                  .from("restaurant-media")
                  .getPublicUrl(path).data.publicUrl;
              };
              const logo = await upload("logo", draft.logo_url);
              const cover = await upload("cover", draft.cover_url);
              await rpc("save_restaurant", {
                p_restaurant: restaurant.id,
                p_data: { ...draft, logo_url: logo, cover_url: cover },
              });
              setDraft((d) => ({ ...d, logo_url: logo, cover_url: cover }));
            }, t("success"));
          }}
        >
          <div className="settings-section-label">
            {de ? "Stilvorlagen" : tx("Start with a style")}
          </div>
          <p className="role-note">
            {de
              ? "Vorlagen ändern Farben, Schriften und Layout. Ihre Inhalte bleiben erhalten. Erst Speichern übernimmt die Änderungen."
              : tx(
                  "Presets change colors, fonts, and layout. Your content stays in place. Save when you are happy with the preview.",
                )}
          </p>
          <div className="brand-presets">
            {[
              {
                label: tx("Olive café"),
                brand_color: "#53634b",
                accent_color: "#b58a56",
                font_family: "friendly" as const,
                heading_font: "editorial" as const,
                interface_style: "soft" as const,
                theme_mode: "light" as const,
                menu_layout: "grid" as const,
              },
              {
                label: tx("Modern bistro"),
                brand_color: "#303b56",
                accent_color: "#a48554",
                font_family: "modern" as const,
                heading_font: "modern" as const,
                interface_style: "minimal" as const,
                theme_mode: "light" as const,
                menu_layout: "list" as const,
              },
              {
                label: tx("After hours"),
                brand_color: "#b4c797",
                accent_color: "#e2b275",
                font_family: "modern" as const,
                heading_font: "editorial" as const,
                interface_style: "classic" as const,
                theme_mode: "dark" as const,
                menu_layout: "grid" as const,
              },
            ].map(({ label, ...preset }) => (
              <button
                key={label}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, ...preset }))}
              >
                <span style={{ background: preset.brand_color }} />
                {label}
              </button>
            ))}
          </div>
          <div className="settings-section-label">
            {de ? "Identität & Kontakt" : tx("Identity & contact")}
          </div>
          <Field label={t("name")}>
            <input
              required
              minLength={2}
              maxLength={100}
              value={draft.name}
              onChange={(e) => change("name", e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label={tx("Logo URL")}>
              <input
                type="url"
                value={draft.logo_url || ""}
                onChange={(e) => change("logo_url", e.target.value)}
              />
            </Field>
            <Field
              label={
                de
                  ? "Logo hochladen (PNG, JPEG, WebP)"
                  : tx("Upload logo (PNG, JPEG, WebP)")
              }
            >
              <input
                type="file"
                name="logo"
                accept="image/png,image/jpeg,image/webp"
              />
            </Field>
          </div>
          <Field label={t("address")}>
            <input
              value={draft.address}
              onChange={(e) => change("address", e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label={de ? "Telefonnummer" : tx("Phone number")}>
              <input
                type="tel"
                maxLength={40}
                autoComplete="tel"
                value={draft.phone || ""}
                onChange={(e) => change("phone", e.target.value)}
              />
            </Field>
            <Field label={t("contact")}>
              <input
                value={draft.contact}
                onChange={(e) => change("contact", e.target.value)}
              />
            </Field>
          </div>
          <Field label={t("hours")}>
            <textarea
              value={draft.opening_hours}
              onChange={(e) => change("opening_hours", e.target.value)}
            />
          </Field>
          <div className="settings-section-label">
            {de ? "Farben & Darstellung" : tx("Colors & appearance")}
          </div>
          <div className="form-grid">
            <Field label={t("brandColor")}>
              <input
                type="color"
                value={draft.brand_color}
                onChange={(e) => change("brand_color", e.target.value)}
              />
            </Field>
            <Field label={de ? "Akzentfarbe" : tx("Accent color")}>
              <input
                type="color"
                value={draft.accent_color || "#b58a56"}
                onChange={(e) => change("accent_color", e.target.value)}
              />
            </Field>
          </div>
          <div className="form-grid">
            <Field label={de ? "Farbschema" : tx("Color mode")}>
              <select
                value={draft.theme_mode || "light"}
                onChange={(e) => change("theme_mode", e.target.value)}
              >
                <option value="light">{de ? "Hell" : tx("Light")}</option>
                <option value="dark">{de ? "Dunkel" : tx("Dark")}</option>
                <option value="system">
                  {de ? "Systemeinstellung" : tx("Follow device")}
                </option>
              </select>
            </Field>
            <Field label={de ? "Schriftart" : tx("Typography")}>
              <select
                value={draft.font_family || "modern"}
                onChange={(e) => change("font_family", e.target.value)}
              >
                <option value="modern">
                  {de ? "Modern · Sans Serif" : tx("Modern · Sans serif")}
                </option>
                <option value="editorial">
                  {de ? "Editorial · Serifenschrift" : tx("Editorial · Serif")}
                </option>
                <option value="friendly">
                  {de ? "Freundlich · Humanistisch" : tx("Friendly · Humanist")}
                </option>
              </select>
            </Field>
          </div>
          <div className="form-grid">
            <Field label={de ? "Oberflächenstil" : tx("Interface style")}>
              <select
                value={draft.interface_style || "classic"}
                onChange={(e) => change("interface_style", e.target.value)}
              >
                <option value="classic">
                  {de ? "Klassisch" : tx("Classic")}
                </option>
                <option value="soft">
                  {de ? "Weich & rund" : tx("Soft & rounded")}
                </option>
                <option value="minimal">
                  {de ? "Minimalistisch" : tx("Minimal")}
                </option>
              </select>
            </Field>
            <Field label={de ? "Speisekartenlayout" : tx("Guest menu layout")}>
              <select
                value={draft.menu_layout || "grid"}
                onChange={(e) => change("menu_layout", e.target.value)}
              >
                <option value="grid">
                  {de ? "Kartenraster" : tx("Card grid")}
                </option>
                <option value="list">
                  {de ? "Kompakte Liste" : tx("Compact list")}
                </option>
              </select>
            </Field>
          </div>
          <div className="form-grid">
            <Field label={de ? "Überschriftenschrift" : tx("Heading font")}>
              <select
                value={draft.heading_font || "editorial"}
                onChange={(e) => change("heading_font", e.target.value)}
              >
                <option value="modern">{tx("Modern · Sans serif")}</option>
                <option value="editorial">{tx("Editorial · Serif")}</option>
                <option value="friendly">{tx("Friendly · Humanist")}</option>
              </select>
            </Field>
            <Field label={de ? "Abstände" : tx("Interface spacing")}>
              <select
                value={draft.density || "comfortable"}
                onChange={(e) => change("density", e.target.value)}
              >
                <option value="comfortable">
                  {de ? "Großzügig" : tx("Comfortable")}
                </option>
                <option value="compact">
                  {de ? "Kompakt" : tx("Compact")}
                </option>
              </select>
            </Field>
          </div>
          <Field label={de ? "Team-Avatare" : tx("Interface avatars")}>
            <select
              value={draft.show_avatars === false ? "hidden" : "visible"}
              onChange={(e) =>
                change("show_avatars", e.target.value === "visible")
              }
            >
              <option value="visible">
                {de ? "Anzeigen" : tx("Show characters")}
              </option>
              <option value="hidden">
                {de ? "Ausblenden" : tx("Hide characters")}
              </option>
            </select>
          </Field>
          <div className="settings-section-label">
            {de ? "Gäste willkommen heißen" : tx("Guest welcome experience")}
          </div>
          <Field label={de ? "Begrüßungstitel" : tx("Welcome heading")}>
            <input
              maxLength={120}
              value={draft.welcome_title || ""}
              placeholder={draft.name}
              onChange={(e) => change("welcome_title", e.target.value)}
            />
          </Field>
          <Field label={de ? "Begrüßungsnachricht" : tx("Welcome message")}>
            <textarea
              maxLength={500}
              value={draft.welcome_message || ""}
              placeholder={
                de
                  ? "Eine persönliche Nachricht für Ihre Gäste"
                  : tx("A personal note for your guests")
              }
              onChange={(e) => change("welcome_message", e.target.value)}
            />
          </Field>
          <Field label={de ? "Titelbild-URL" : tx("Guest cover image URL")}>
            <input
              type="url"
              value={draft.cover_url || ""}
              onChange={(e) => change("cover_url", e.target.value)}
            />
          </Field>
          <Field
            label={
              de
                ? "Titelbild hochladen (PNG, JPEG, WebP)"
                : tx("Upload cover image (PNG, JPEG, WebP)")
            }
          >
            <input
              type="file"
              name="cover"
              accept="image/png,image/jpeg,image/webp"
            />
          </Field>
          <Button disabled={busy}>
            <Check size={17} />
            {t("save")}
          </Button>
        </form>
      </section>
      <aside
        className="branding-preview themed"
        data-theme={draft.theme_mode || "light"}
        data-style={draft.interface_style || "classic"}
        style={brandingStyle(draft)}
        {...brandingAttributes(draft)}
      >
        <div className="eyebrow">
          {de
            ? "LIVE-VORSCHAU · NOCH NICHT GESPEICHERT"
            : tx("LIVE PREVIEW · UNSAVED CHANGES")}
        </div>
        <section className="panel">
          {draft.cover_url && (
            <img className="preview-cover" src={draft.cover_url} alt="" />
          )}
          <div className="brand-preview-logo">
            {draft.logo_url ? (
              <img src={draft.logo_url} alt="" />
            ) : (
              <RoleAvatar role="guest" size={75} />
            )}
          </div>
          <h1>{draft.welcome_title || draft.name}</h1>
          {draft.welcome_message && <p>{draft.welcome_message}</p>}
          <p>{draft.address}</p>
          <p>{draft.phone}</p>
          <div className="brand-swatches">
            <span style={{ background: draft.brand_color }} />
            <span style={{ background: draft.accent_color || "#b58a56" }} />
          </div>
          <Button type="button" tabIndex={-1}>
            {de ? "Speisekarte entdecken" : tx("Explore the menu")}
          </Button>
          <div className="brand-preview-team">
            <RoleAvatar role="admin" size={42} />
            <RoleAvatar role="kitchen" size={42} />
            <RoleAvatar role="service" size={42} />
          </div>
        </section>
        <small>
          {de
            ? "Schriftarten sind lokal verfügbar; keine externen Schriftanbieter."
            : tx("Local font stacks. No external font tracking or downloads.")}
        </small>
      </aside>
    </div>
  );
}
