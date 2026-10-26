import { describe, it, expect, vi, afterEach } from "vitest";
import { restaurantAuthOptions } from "../lib/auth-storage";
const storage = () => {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => items.set(k, v),
    removeItem: (k: string) => items.delete(k),
  };
};
afterEach(() => vi.unstubAllGlobals());
describe("restaurant auth isolation", () => {
  it("keeps browser tabs separate and prevents Supabase auth broadcasts from merging them", () => {
    const first = storage(),
      second = storage();
    vi.stubGlobal("window", { sessionStorage: first });
    const a = restaurantAuthOptions();
    a.storage.setItem(a.storageKey, "account-a");
    vi.stubGlobal("window", { sessionStorage: second });
    const b = restaurantAuthOptions();
    expect(b.storageKey).not.toBe(a.storageKey);
    expect(b.storage.getItem(b.storageKey)).toBeNull();
    b.storage.setItem(b.storageKey, "account-b");
    vi.stubGlobal("window", { sessionStorage: first });
    expect(a.storage.getItem(a.storageKey)).toBe("account-a");
    const reloaded = restaurantAuthOptions();
    expect(reloaded.storage.getItem(reloaded.storageKey)).toBe("account-a");
    a.storage.removeItem(a.storageKey);
    vi.stubGlobal("window", { sessionStorage: second });
    expect(b.storage.getItem(b.storageKey)).toBe("account-b");
  });
});
