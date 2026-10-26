import type {FontFamily,InterfaceStyle} from "./appearance-options";
export type Role = "owner" | "admin" | "cook" | "waiter";
export type Status = "placed" | "preparing" | "ready" | "served" | "cancelled";
export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  currency: string;
  brand_color: string;
  logo_url: string | null;
  address: string;
  contact: string;
  phone: string;
  accent_color: string;
  theme_mode: "light" | "dark" | "system";
  font_family: FontFamily;
  interface_style: InterfaceStyle;
  menu_layout: "grid" | "list";
  heading_font: FontFamily;
  density: "comfortable" | "compact";
  show_avatars: boolean;
  welcome_title: string;
  welcome_message: string;
  cover_url: string | null;
  default_language: "en"|"de"|"tr";
  opening_hours: string;
  plan_id: string;
  active: boolean;
};
export type Membership = { restaurant_id: string; user_id: string; role: Role };
export type Category = { id: string; name: string; position: number };
export type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string;
  price_cents: number;
  ingredients: string[];
  allergens: string[];
  image_url: string | null;
  video_url: string | null;
  available: boolean;
  archived: boolean;
};
export type OrderItem = {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  instructions: string;
  cancelled: boolean;
};
export type Order = {
  id: string;
  session_id: string;
  table_name: string;
  status: Status;
  created_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  order_items: OrderItem[];
};
export type DiningTable = {
  id: string;
  name: string;
  access_token: string;
  active: boolean;
  assigned_waiter: string | null;
};
export type ServiceRequest = {
  id: string;
  table_name: string;
  message: string;
  resolved: boolean;
};
export type Feedback = {
  id: string;
  order_id: string;
  rating: number;
  comment: string;
  created_at: string;
};
export type CartItem = {
  menu_item_id: string;
  quantity: number;
  instructions: string;
};
export const statusFlow: Status[] = ["placed", "preparing", "ready", "served"];
export function orderTotal(order: Pick<Order, "order_items">) {
  return order.order_items
    .filter((i) => !i.cancelled)
    .reduce((sum, i) => sum + i.quantity * i.price_cents, 0);
}
export function canTransition(
  role: Role | undefined,
  from: Status,
  to: Status,
) {
  return (
    !!role &&
    ((from === "placed" && to === "preparing") ||
    (from === "preparing" && to === "ready")
      ? ["owner", "admin", "cook"].includes(role)
      : from === "ready" &&
        to === "served" &&
        ["owner", "admin", "waiter"].includes(role))
  );
}
export type EmployeeSetupData={id:string;restaurant_id:string;restaurant_name:string;slug:string;name:string;email:string;phone:string;employee_id:string;role:'cook'|'waiter';photo_path:string|null};
