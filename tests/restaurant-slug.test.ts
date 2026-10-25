import { describe, it, expect } from "vitest";
import {
  RESTAURANT_SLUG_PATTERN,
  isRestaurantSlug,
} from "../lib/restaurant-slug";
describe("restaurant identifier validation", () => {
  it("compiles under the HTML pattern Unicode Sets rules", () => {
    const htmlPattern = new RegExp(`^(?:${RESTAURANT_SLUG_PATTERN})$`, "v");
    for (const value of ["greenbites", "green-bites", "a12", "a".repeat(61)]) {
      expect(htmlPattern.test(value)).toBe(true);
      expect(isRestaurantSlug(value)).toBe(true);
    }
    for (const value of [
      "www.greenbites.com",
      "https://greenbites.com",
      "green bites",
      "ab",
      "-green",
      "Greenbites",
      "a".repeat(62),
    ]) {
      expect(htmlPattern.test(value)).toBe(false);
      expect(isRestaurantSlug(value)).toBe(false);
    }
  });
});
