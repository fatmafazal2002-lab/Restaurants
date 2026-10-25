// HTML patterns use the Unicode Sets (v) flag: a literal hyphen must be escaped.
export const RESTAURANT_SLUG_PATTERN = "[a-z0-9][a-z0-9\\-]{2,60}";
export function isRestaurantSlug(value: string) {
  return /^[a-z0-9][a-z0-9-]{2,60}$/.test(value);
}
