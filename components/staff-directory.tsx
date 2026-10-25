"use client";
import { translateText as tx } from "@/lib/translation";
import { usePreferences } from "./preferences";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { rpc } from "@/lib/supabase";
import { errorMessage } from "@/lib/utils";
import { portalForRole, portalTitle, portals } from "@/lib/portals";
import type { Role } from "@/lib/types";
import { RoleAvatar } from "./role-avatar";
import { Button } from "./ui/button";
export function StaffDirectory({
  restaurantId,
  slug,
  refreshKey,
  locale,
}: {
  restaurantId: string;
  slug: string;
  refreshKey: string;
  locale: string;
}) {
  usePreferences();

  const [staff, setStaff] = useState<
      { user_id: string; email: string; role: Role }[]
    >([]),
    [error, setError] = useState(""),
    [copied, setCopied] = useState("");
  const de = locale === "de";
  useEffect(() => {
    let alive = true;
    rpc<typeof staff>("list_staff", { p_restaurant: restaurantId })
      .then((rows) => {
        if (alive) {
          setStaff(rows);
          setError("");
        }
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [restaurantId, refreshKey]);
  return (
    <>
      <section className="staff-login-links">
        {portals.map((p) => (
          <div className="panel" key={p}>
            <RoleAvatar role={p} size={60} />
            <h3>{portalTitle(p, de)}</h3>
            <p>
              {de
                ? "Eigener Login für dieses Restaurant."
                : tx("A dedicated login for this restaurant.")}
            </p>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${location.origin}/login/${p}?restaurant=${encodeURIComponent(slug)}`,
                  );
                  setCopied(p);
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              {copied === p ? <Check size={15} /> : <Copy size={15} />}
              {copied === p
                ? de
                  ? "Kopiert"
                  : tx("Copied")
                : de
                  ? "Login-Link kopieren"
                  : tx("Copy login link")}
            </Button>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>{de ? "Ihr Team" : tx("Your team")}</h2>
        <p className="role-note">
          {tx(
            "Add employee profiles above, then share the matching role login link. Employees must verify their email address.",
          )}
        </p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {staff.map((person) => (
          <div className="order-row" key={person.user_id}>
            <RoleAvatar role={portalForRole(person.role)} size={44} />
            <div>
              <strong>{person.email}</strong>
              <small>
                {person.role === "owner"
                  ? de
                    ? "Inhaber"
                    : tx("Owner")
                  : portalTitle(portalForRole(person.role), de)}
              </small>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
