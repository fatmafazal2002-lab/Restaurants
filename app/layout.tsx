import type { Metadata } from "next";
import "./globals.css";
import { PreferencesProvider } from "@/components/preferences";
import { NotificationsProvider } from "@/components/notifications";
import { MotionProvider } from "@/components/motion-provider";
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
      <body>
        <PreferencesProvider>
          <MotionProvider>
            <NotificationsProvider>{children}</NotificationsProvider>
          </MotionProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
