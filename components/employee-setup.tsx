"use client";
import {ToastBridge} from "./notifications";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { employeeApi } from "@/lib/employee-api";
import { errorMessage } from "@/lib/utils";
import { translateText as tx } from "@/lib/translation";
import type { EmployeeSetupData } from "@/lib/types";
import { Field } from "./shared";
import { Button } from "./ui/button";
import { PreferenceControls, usePreferences } from "./preferences";
import { SignOutButton } from "./sign-out-button";
import { RoleAvatar } from "./role-avatar";
export function EmployeeSetup({ profile }: { profile: EmployeeSetupData }) {
  usePreferences();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="employee-setup">
      <ToastBridge message={error} kind="error"/>
      <header>
        <strong>{profile.restaurant_name}</strong>
        <PreferenceControls />
        <SignOutButton />
      </header>
      <section className="panel">
        <RoleAvatar
          role={profile.role === "cook" ? "kitchen" : "service"}
          size={90}
        />
        <p className="eyebrow">{tx("Your first shift starts here")}</p>
        <h1>{tx("Make this account yours")}</h1>
        <p>
          {tx(
            "Choose a new password and complete your profile to unlock your workspace.",
          )}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              const password = String(form.get("password"));
              if (password !== form.get("confirm"))
                throw new Error(tx("Passwords do not match."));
              let photo = profile.photo_path;
              const file = form.get("photo") as File;
              if (file?.size) {
                if (
                  file.size > 10 * 1024 * 1024 ||
                  !["image/png", "image/jpeg", "image/webp"].includes(file.type)
                )
                  throw new Error(
                    tx("Choose a PNG, JPEG or WebP image under 10 MB."),
                  );
                photo = `${profile.restaurant_id}/${profile.id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
                const { error } = await supabase!.storage
                  .from("employee-photos")
                  .upload(photo, file);
                if (error) throw error;
              }
              const result = await employeeApi<{ slug: string; role: string }>(
                "complete",
                {
                  name: form.get("name"),
                  phone: form.get("phone"),
                  password,
                  photo_path: photo,
                },
              );
              const { error } = await supabase!.auth.signInWithPassword({
                email: profile.email,
                password,
              });
              if (error) throw error;
              location.replace(
                `/r/${encodeURIComponent(result.slug)}/${result.role === "cook" ? "kitchen" : "service"}`,
              );
            } catch (e) {
              setError(errorMessage(e));
              setBusy(false);
            }
          }}
        >
          <Field label={tx("Email")}>
            <input value={profile.email} readOnly />
          </Field>
          <Field label={tx("Employee ID")}>
            <input value={profile.employee_id} readOnly />
          </Field>
          <Field label={tx("Full name")}>
            <input
              name="name"
              required
              maxLength={100}
              autoComplete="name"
              defaultValue={profile.name}
            />
          </Field>
          <Field label={tx("Phone number")}>
            <input
              name="phone"
              type="tel"
              required
              maxLength={40}
              autoComplete="tel"
              defaultValue={profile.phone}
            />
          </Field>
          <Field label={tx("Employee photo")}>
            <input
              name="photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
            />
          </Field>
          <Field label={tx("New password")}>
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          <Field label={tx("Confirm new password")}>
            <input
              name="confirm"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </Field>
          {error && (
            <p role="alert" className="error-banner">
              {error}
            </p>
          )}
          <Button disabled={busy}>
            {tx(busy ? "Saving…" : "Unlock my workspace")}
          </Button>
        </form>
      </section>
    </main>
  );
}
