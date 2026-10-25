import { describe, it, expect } from "vitest";
import { canUsePortal, portalForRole } from "../lib/portals";
import { brandingStyle, contrastText } from "../lib/branding";
describe("separate staff workspaces", () => {
  it("routes each assigned role to its workspace", () => {
    expect(portalForRole("cook")).toBe("kitchen");
    expect(portalForRole("waiter")).toBe("service");
    expect(portalForRole("admin")).toBe("admin");
  });
  it("does not grant permissions from the selected login route", () => {
    expect(canUsePortal(undefined, "admin")).toBe(false);
    expect(canUsePortal("cook", "admin")).toBe(false);
    expect(canUsePortal("waiter", "kitchen")).toBe(false);
    expect(canUsePortal("cook", "kitchen")).toBe(true);
    expect(canUsePortal("waiter", "service")).toBe(true);
    expect(canUsePortal("owner", "kitchen")).toBe(true);
  });
});
describe("brand readability", () => {
  it("chooses readable primary button text for light and dark colors", () => {
    expect(contrastText("#ffffff")).toBe("#152019");
    expect(contrastText("#000000")).toBe("#ffffff");
  });
  it("applies restaurant-specific fonts and colors without external font services", () => {
    const style = brandingStyle({
      brand_color: "#eeeeee",
      accent_color: "#bf3755",
      font_family: "editorial",
    });
    expect(style).toMatchObject({
      "--brand": "#eeeeee",
      "--brand-ink": "#152019",
      "--accent": "#bf3755",
    });
    expect(style.fontFamily).toBeUndefined();
    expect(JSON.stringify(style)).toContain("Georgia");
  });
});
