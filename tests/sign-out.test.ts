import { describe, it, expect, vi } from "vitest";
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabase: { auth: { signOut } } }));
import { signOutCurrentBrowser } from "../lib/sign-out";
describe("explicit browser sign-out", () => {
  it("signs out this browser without a stale workspace refresh", async () => {
    signOut.mockResolvedValue({ error: null });
    await signOutCurrentBrowser();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("reports auth errors instead of silently pretending logout succeeded", async () => {
    const error = new Error("Session service unavailable");
    signOut.mockResolvedValue({ error });
    await expect(signOutCurrentBrowser()).rejects.toThrow(
      "Session service unavailable",
    );
  });
});
