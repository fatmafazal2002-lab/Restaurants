import german from "./german.json";
import { en, de } from "./i18n";
const germanCore = Object.fromEntries(
  Object.entries(en).map(([k, v]) => [v, de[k as keyof typeof de]]),
);
import turkish from "./turkish.json";
export type Locale = "en" | "de" | "tr";
let current: Locale = "en";
export function setTranslationLocale(locale: Locale) {
  current = locale;
}
export function translateText(value: string) {
  const dictionary: Record<string, string> =
    current === "tr"
      ? turkish
      : current === "de"
        ? { ...germanCore, ...german }
        : {};
  return dictionary[value] ?? value;
}
export function getTranslationLocale() {
  return current;
}
