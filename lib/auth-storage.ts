/** Stable tab-local storage, but a unique broadcast channel for each client runtime.
 * Supabase otherwise broadcasts auth changes across tabs even with sessionStorage. */
export function restaurantAuthOptions() {
  const storageKey = `mise:restaurant-channel:${typeof window === "undefined" ? "server" : crypto.randomUUID()}`;
  const normalized = (key: string) =>
    key.replace(storageKey, "mise:restaurant-auth:v2");
  return {
    storageKey,
    storage: {
      getItem: (key: string) =>
        typeof window === "undefined"
          ? null
          : window.sessionStorage.getItem(normalized(key)),
      setItem: (key: string, value: string) => {
        if (typeof window !== "undefined")
          window.sessionStorage.setItem(normalized(key), value);
      },
      removeItem: (key: string) => {
        if (typeof window !== "undefined")
          window.sessionStorage.removeItem(normalized(key));
      },
    },
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  };
}
