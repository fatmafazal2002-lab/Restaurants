import { describe, it, expect } from "vitest";
import { canTransition, orderTotal } from "../lib/types";
import { money } from "../lib/utils";
describe("UI permissions and monetary display", () => {
  it("limits controls by role and adjacent transition", () => {
    expect(canTransition("cook", "placed", "preparing")).toBe(true);
    expect(canTransition("waiter", "placed", "preparing")).toBe(false);
    expect(canTransition("cook", "ready", "served")).toBe(false);
    expect(canTransition("waiter", "ready", "served")).toBe(true);
    expect(canTransition("owner", "placed", "served")).toBe(false);
  });
  it("excludes cancelled lines from totals", () => {
    expect(
      orderTotal({
        order_items: [
          {
            id: "a",
            name: "Soup",
            price_cents: 1250,
            quantity: 2,
            instructions: "",
            cancelled: false,
          },
          {
            id: "b",
            name: "Tea",
            price_cents: 450,
            quantity: 1,
            instructions: "",
            cancelled: true,
          },
        ],
      }),
    ).toBe(2500);
  });
  it("formats euro amounts for German guests", () => {
    expect(money(1250, "EUR", "de")).toContain("12,50");
  });
});
