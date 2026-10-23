import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Mise · A better service",
  description:
    "A thoughtful workspace for your restaurant. Menus, ordering, kitchen and floor service, together.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
