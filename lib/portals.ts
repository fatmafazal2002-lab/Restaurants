import { translateText as tx } from "./translation";
import type { Role } from "./types";
export type Portal = "admin" | "kitchen" | "service";
export const portals: Portal[] = ["admin", "kitchen", "service"];
export function portalForRole(role?: Role): Portal {
  return role === "cook" ? "kitchen" : role === "waiter" ? "service" : "admin";
}
export function canUsePortal(role: Role | undefined, portal: Portal) {
  return (
    !!role &&
    (role === "owner" || role === "admin" || portalForRole(role) === portal)
  );
}
export function portalTitle(portal: Portal, de = false) {
  return portal === "admin"
    ? de
      ? "Administration"
      : tx("Administration")
    : portal === "kitchen"
      ? de
        ? "Küchenteam"
        : tx("Kitchen team")
      : de
        ? "Service-Team"
        : tx("Floor service");
}
