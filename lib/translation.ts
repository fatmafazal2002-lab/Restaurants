import turkish from "./turkish.json";
export type Locale = "en" | "de" | "tr";
let current: Locale = "en";
export function setTranslationLocale(locale: Locale) {
  current = locale;
}
export function translateText(value: string) {
  if (current !== "tr") return value;
  return (turkish as Record<string, string>)[value] ?? value;
}
export function getTranslationLocale() {
  return current;
}
