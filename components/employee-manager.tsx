"use client";
import { employeeApi } from "@/lib/employee-api";
import { ToastBridge } from "./notifications";
import { useEffect, useState } from "react";
import { translateText as tx } from "@/lib/translation";
import { usePreferences } from "./preferences";
import { rpc, supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/utils";
import { Button } from "./ui/button";
import { Field, Modal } from "./shared";
import { RoleAvatar } from "./role-avatar";
import { portalForRole } from "@/lib/portals";
import { StaffDirectory } from "./staff-directory";
type Employee = {
  id: string;
  name: string;
  email: string;
  phone: string;
  employee_id: string;
  photo_path: string | null;
  role: "admin" | "cook" | "waiter";
  user_id: string | null;
  archived: boolean;
  photo?: string;
};
export function EmployeeManager({
  restaurantId,
  slug,
  owner,
  onChanged,
}: {
  restaurantId: string;
  slug: string;
  owner: boolean;
  onChanged: () => void;
}) {
  const { locale } = usePreferences();
  const [provision, setProvision] = useState(false),
    [credentials, setCredentials] = useState<{
      email: string;
      password?: string;
      existing: boolean;
      role: string;
    } | null>(null);
  const [rows, setRows] = useState<Employee[]>([]),
    [editing, setEditing] = useState<Partial<Employee> | null>(null),
    [deleting, setDeleting] = useState<Employee | null>(null),
    [revision, setRevision] = useState(0),
    [archived, setArchived] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase!
        .from("employee_profiles")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("name");
      if (error) throw error;
      const result = await Promise.all(
        (data ?? []).map(async (e) => {
          if (!e.photo_path) return e;
          const { data } = await supabase!.storage
            .from("employee-photos")
            .createSignedUrl(e.photo_path, 3600);
          return { ...e, photo: data?.signedUrl };
        }),
      );
      if (alive) setRows(result);
    })().catch((e) => {
      if (alive) setError(errorMessage(e));
    });
    return () => {
      alive = false;
    };
  }, [restaurantId, revision]);
  return (
    <>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>{tx("Employee profiles")}</h2>
            <p>
              {tx(
                "Create a cook or floor-service account. New employees receive a temporary password and complete their own profile.",
              )}
            </p>
          </div>
          <Button
            onClick={() => {
              setError("");
              setProvision(true);
            }}
          >
            {tx("Add employee")}
          </Button>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          {tx("Show removed employees")}
        </label>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="employee-grid">
          {rows
            .filter((e) => e.archived === archived)
            .map((e) => (
              <article className="employee-card" key={e.id}>
                {e.photo ? (
                  <img src={e.photo} alt={e.name} />
                ) : (
                  <RoleAvatar role={portalForRole(e.role)} size={65} />
                )}
                <h3>{e.name}</h3>
                <p>
                  {tx(
                    e.role === "cook"
                      ? "Kitchen team"
                      : e.role === "waiter"
                        ? "Floor service"
                        : "Admin",
                  )}
                </p>
                <dl>
                  <dt>{tx("Email")}</dt>
                  <dd>{e.email}</dd>
                  <dt>{tx("Phone number")}</dt>
                  <dd>{e.phone || "—"}</dd>
                  <dt>{tx("Employee ID")}</dt>
                  <dd>{e.employee_id}</dd>
                </dl>
                <small>
                  {tx(
                    e.archived
                      ? "Removed"
                      : e.user_id
                        ? "Account connected"
                        : "Waiting for registration",
                  )}
                </small>
                {(owner || e.role !== "admin") && (
                  <div className="settings-actions">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setError("");
                        setEditing(e);
                      }}
                    >
                      {tx(e.archived ? "Restore and edit" : "Edit")}
                    </Button>
                    {!e.archived && (
                      <Button variant="ghost" onClick={() => setDeleting(e)}>
                        {tx("Remove")}
                      </Button>
                    )}
                  </div>
                )}
              </article>
            ))}
        </div>
        {!rows.some((e) => e.archived === archived) && (
          <p>{tx("No employee profiles yet.")}</p>
        )}
      </section>
      <StaffDirectory
        restaurantId={restaurantId}
        slug={slug}
        refreshKey={String(revision)}
        locale={locale}
      />
      <ToastBridge message={notice} />
      <ToastBridge message={error} kind="error" />
      {provision && (
        <Modal
          title={tx("Create employee login")}
          close={() => {
            if (!busy) setProvision(false);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setNotice("");
              const f = new FormData(e.currentTarget);
              try {
                const result = await employeeApi<{
                  email: string;
                  password?: string;
                  existing: boolean;
                }>("provision", {
                  restaurant_id: restaurantId,
                  email: f.get("email"),
                  role: f.get("role"),
                  employee_id: f.get("employee_id"),
                });
                setCredentials({ ...result, role: String(f.get("role")) });
                setProvision(false);
                setRevision((n) => n + 1);
                onChanged();
                setNotice(tx("Employee login is ready."));
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={tx("Email")}>
              <input name="email" type="email" required maxLength={254} />
            </Field>
            <Field label={tx("Role")}>
              <select name="role">
                <option value="cook">{tx("Kitchen team")}</option>
                <option value="waiter">{tx("Floor service")}</option>
              </select>
            </Field>
            <Field label={tx("Employee ID (optional)")}>
              <input name="employee_id" maxLength={40} />
            </Field>
            <p>
              {tx(
                "The employee will enter their name, phone and photo after their first sign-in.",
              )}
            </p>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <Button disabled={busy}>
              {tx(busy ? "Saving…" : "Create employee login")}
            </Button>
          </form>
        </Modal>
      )}
      {credentials && (
        <Modal
          title={tx("Employee sign-in details")}
          close={() => setCredentials(null)}
        >
          <p>{credentials.email}</p>
          {credentials.existing ? (
            <p>
              {tx(
                "This employee already has an account. Their current password stays unchanged.",
              )}
            </p>
          ) : (
            <>
              <p>
                {tx(
                  "Share these details privately with the employee. This temporary password is shown only now.",
                )}
              </p>
              <Field label={tx("Temporary password")}>
                <input readOnly value={credentials.password} />
              </Field>
            </>
          )}
          <Field label={tx("Login link")}>
            <input
              readOnly
              value={`${location.origin}/r/${encodeURIComponent(slug)}/${credentials.role === "cook" ? "kitchen" : "service"}`}
            />
          </Field>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${credentials.email}\n${credentials.password || tx("Use your existing password")}\n${location.origin}/r/${slug}/${credentials.role === "cook" ? "kitchen" : "service"}`,
                );
                setNotice(tx("Copied to clipboard"));
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            {tx("Copy sign-in details")}
          </Button>
        </Modal>
      )}
      {editing && (
        <Modal
          title={tx(editing.id ? "Edit employee" : "Add employee")}
          close={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                const data = {
                  name: f.get("name"),
                  email: f.get("email"),
                  phone: f.get("phone"),
                  employee_id: f.get("employee_id"),
                  role: f.get("role"),
                  photo_path: f.has("remove_photo")
                    ? null
                    : (editing.photo_path ?? null),
                };
                const file = f.get("photo") as File;
                if (
                  file?.size &&
                  (file.size > 10 * 1024 * 1024 ||
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      file.type,
                    ))
                )
                  throw new Error(
                    tx("Choose a PNG, JPEG or WebP image under 10 MB."),
                  );
                const id = await rpc<string>("save_employee", {
                  p_restaurant: restaurantId,
                  p_id: editing.id ?? null,
                  p_data: data,
                });
                setEditing((d) => ({ ...d, id }));
                if (file?.size) {
                  const path = `${restaurantId}/${id}/${crypto.randomUUID()}.${file.type.split("/")[1]}`;
                  const { error } = await supabase!.storage
                    .from("employee-photos")
                    .upload(path, file);
                  if (error) throw error;
                  await rpc("save_employee", {
                    p_restaurant: restaurantId,
                    p_id: id,
                    p_data: { ...data, photo_path: path },
                  });
                }
                setRevision((r) => r + 1);
                onChanged();
                setEditing(null);
                setNotice(tx("Employee saved."));
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={tx("Full name")}>
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={editing.name}
              />
            </Field>
            <Field label={tx("Email")}>
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                defaultValue={editing.email}
              />
            </Field>
            <Field label={tx("Phone number")}>
              <input
                name="phone"
                type="tel"
                maxLength={40}
                defaultValue={editing.phone}
              />
            </Field>
            <Field label={tx("Employee ID")}>
              <input
                name="employee_id"
                required
                maxLength={40}
                defaultValue={editing.employee_id}
              />
            </Field>
            <Field label={tx("Role")}>
              <select name="role" defaultValue={editing.role}>
                <option value="cook">{tx("Kitchen team")}</option>
                <option value="waiter">{tx("Floor service")}</option>
                {owner && <option value="admin">{tx("Admin")}</option>}
              </select>
            </Field>
            <Field label={tx("Employee photo")}>
              <input
                name="photo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
              />
            </Field>
            {editing.photo_path && (
              <label className="check-label">
                <input type="checkbox" name="remove_photo" />
                {tx("Remove photo")}
              </label>
            )}
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <Button disabled={busy}>
              {tx(busy ? "Saving…" : "Save changes")}
            </Button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title={tx("Remove employee")} close={() => setDeleting(null)}>
          <p>{deleting.name}</p>
          <p>
            {tx(
              "This removes restaurant access. The profile is archived and can be restored.",
            )}
          </p>
          <Button
            disabled={busy}
            variant="destructive"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await rpc("remove_employee", {
                  p_restaurant: restaurantId,
                  p_id: deleting.id,
                });
                setDeleting(null);
                setRevision((r) => r + 1);
                onChanged();
                setNotice(tx("Employee removed."));
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tx("Remove employee")}
          </Button>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </>
  );
}
