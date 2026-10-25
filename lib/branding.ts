import type { CSSProperties } from "react";
import type { Restaurant } from "./types";
export type Branding = Pick<
  Restaurant,
  | "id"
  | "slug"
  | "name"
  | "logo_url"
  | "address"
  | "phone"
  | "contact"
  | "opening_hours"
  | "brand_color"
  | "accent_color"
  | "theme_mode"
  | "font_family"
  | "interface_style"
  | "menu_layout"
  | "heading_font"
  | "density"
  | "show_avatars"
  | "welcome_title"
  | "welcome_message"
  | "cover_url"
  | "currency"
>;
export const fontStacks = {
  modern: "Arial, Helvetica, sans-serif",
  editorial: 'Georgia, "Times New Roman", serif',
  friendly: '"Trebuchet MS", Arial, sans-serif',
};
export function contrastText(hex: string) {
  const color = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(color)) return "#ffffff";
  const rgb = [0, 2, 4]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
    ? "#152019"
    : "#ffffff";
}
export function brandingStyle(brand?: Partial<Branding> | null): CSSProperties {
  const primary = brand?.brand_color || "#53634b";
  return {
    "--brand": primary,
    "--brand-ink": contrastText(primary),
    "--accent": brand?.accent_color || "#b58a56",
    "--interface-font": fontStacks[brand?.font_family || "modern"],
    "--heading-font":
      fontStacks[
        brand?.heading_font ||
          (brand?.font_family === "modern" || !brand?.font_family
            ? "editorial"
            : brand.font_family)
      ],
    "--avatar-display": brand?.show_avatars === false ? "none" : "inline-flex",
  } as CSSProperties;
}

export function brandingAttributes(brand?: Partial<Branding> | null) {
  return {
    "data-density": brand?.density || "comfortable",
    "data-avatars": brand?.show_avatars === false ? "hidden" : "visible",
  };
}
