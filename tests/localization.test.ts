import { describe, it, expect } from "vitest";
import { en, tr } from "../lib/i18n";
import dictionary from "../lib/turkish.json";
import { setTranslationLocale, translateText } from "../lib/translation";
import { money } from "../lib/utils";
describe("Turkish interface coverage", () => {
  it("has a Turkish translation for every core interface key", () => {
    for (const [key, value] of Object.entries(en)) {
      expect(Object.hasOwn(dictionary,value),key).toBe(true);
      expect(tr[key as keyof typeof en],key).toBeTruthy();
    }
  });
  it("translates authored copy without changing restaurant-authored data", () => {
    setTranslationLocale("tr");
    expect(translateText("Sign out")).toBe("Çıkış yap");
    expect(translateText("Greenbites")).toBe("Greenbites");
    setTranslationLocale("en");
    expect(translateText("Sign out")).toBe("Sign out");
  });
  it("formats amounts for Turkish readers", () => {
    expect(money(123456, "EUR", "tr")).toContain("1.234,56");
  });
});
