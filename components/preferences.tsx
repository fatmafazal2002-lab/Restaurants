"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  translateText,
  setTranslationLocale,
  type Locale,
} from "@/lib/translation";
type Theme = "restaurant" | "light" | "dark";
const Context = createContext({
  locale: "en" as Locale,
  setLocale: (_l: Locale) => {},
  theme: "restaurant" as Theme,
  setTheme: (_t: Theme) => {},
});
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en"),
    [theme, setThemeState] = useState<Theme>("restaurant");
  const setLocale = (l: Locale) => {
    setTranslationLocale(l);
    setLocaleState(l);
    try {
      localStorage.setItem("mise:language", l);
    } catch {}
    document.documentElement.lang = l;
  };
  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("mise:theme", t);
    } catch {}
    document.documentElement.dataset.appearance = t;
  };
  useEffect(() => {
    try {
      const l = localStorage.getItem("mise:language");
      if (l === "en" || l === "de" || l === "tr") setLocale(l);
      const t = localStorage.getItem("mise:theme");
      if (t === "light" || t === "dark" || t === "restaurant") setTheme(t);
    } catch {}
  }, []);
  return (
    <Context.Provider value={{ locale, setLocale, theme, setTheme }}>
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  return useContext(Context);
}
export function PreferenceControls() {
  const { locale, setLocale, theme, setTheme } = usePreferences();
  return (
    <div className="preference-controls">
      <select
        aria-label={translateText("Language")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
        <option value="tr">Türkçe</option>
      </select>
      <select
        aria-label={translateText("Appearance")}
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
      >
        <option value="restaurant">{translateText("Restaurant theme")}</option>
        <option value="light">{translateText("Light")}</option>
        <option value="dark">{translateText("Dark")}</option>
      </select>
    </div>
  );
}
