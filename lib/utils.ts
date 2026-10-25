import { translateText } from "./translation";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function money(cents: number, currency = "EUR", locale = "en") {
  return new Intl.NumberFormat(
    locale === "tr" ? "tr-TR" : locale === "de" ? "de-DE" : "en-IE",
    {
      style: "currency",
      currency,
    },
  ).format(cents / 100);
}
export function errorMessage(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (code === "23505")
    return translateText(
      "This value is already in use. Check the email, employee ID or name.",
    );
  if (code === "23514" || code === "23502")
    return translateText("Check the form values and required fields.");
  return translateText(
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Something went wrong. Please try again.",
  );
}
