"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { translateText as tx } from "@/lib/translation";
import { usePreferences } from "./preferences";
import { RoleAvatar } from "./role-avatar";
import { SignOutButton } from "./sign-out-button";
import { Button } from "./ui/button";
import type { Portal } from "@/lib/portals";
export function ProfileMenu({
  restaurantId,
  userId,
  email,
  portal,
  slug,
  onSettings,
}: {
  restaurantId: string;
  userId: string;
  email: string;
  portal: Portal;
  slug: string;
  onSettings?: () => void;
}) {
  usePreferences();
  const [profile, setProfile] = useState<{
    name: string;
    photo?: string;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase!
        .from("employee_profiles")
        .select("name,photo_path")
        .eq("restaurant_id", restaurantId)
        .eq("user_id", userId)
        .eq("archived", false)
        .maybeSingle();
      if (!data) return;
      let photo;
      if (data.photo_path) {
        const result = await supabase!.storage
          .from("employee-photos")
          .createSignedUrl(data.photo_path, 3600);
        photo = result.data?.signedUrl;
      }
      if (alive) setProfile({ name: data.name, photo });
    })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [restaurantId, userId]);
  return (
    <details className="profile-menu">
      <summary aria-label={tx("Profile menu")}>
        {profile?.photo ? (
          <img
            src={profile.photo}
            alt=""
            width={36}
            height={36}
            style={{ borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <RoleAvatar role={portal} size={36} />
        )}
        <span className="profile-label">
          {profile?.name || tx("My account")} ▾
        </span>
      </summary>
      <div>
        <strong>{profile?.name || tx("My account")}</strong>
        <p>{email}</p>
        {onSettings && (
          <Button variant="outline" onClick={onSettings}>
            {tx("Restaurant settings")}
          </Button>
        )}
        <SignOutButton
          redirect={`/login/${portal}?restaurant=${encodeURIComponent(slug)}`}
        />
      </div>
    </details>
  );
}
