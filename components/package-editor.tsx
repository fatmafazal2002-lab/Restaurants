"use client";
import { ToastBridge } from "./notifications";
import { translateText as tx } from "@/lib/translation";
import { usePreferences } from "./preferences";

import { useEffect, useState } from "react";
import { rpc, supabase } from "@/lib/platform-supabase";
import { errorMessage } from "@/lib/utils";
import { Button } from "./ui/button";
import { Field } from "./shared";
export type CataloguePlan = {
  id: string;
  name: string;
  table_limit: number;
  staff_limit: number;
  menu_limit: number;
  monthly_price_cents: number;
  currency: string;
  description: string;
  description_tr: string;
  published: boolean;
};
type Feature = {
  code: string;
  name: string;
  name_tr: string;
  description: string;
  builtin: boolean;
};
export function PackageEditor({ onChange }: { onChange: () => void }) {
  const { locale } = usePreferences();

  const [plans, setPlans] = useState<CataloguePlan[]>([]),
    [features, setFeatures] = useState<Feature[]>([]),
    [links, setLinks] = useState<{ plan_id: string; feature_code: string }[]>(
      [],
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [edit, setEdit] = useState<CataloguePlan | null>(null),
    [featureEdit, setFeatureEdit] = useState<Feature | null>(null),
    [revision, setRevision] = useState(0),
    [audit, setAudit] = useState<
      {
        id: number;
        actor_id: string;
        event: string;
        entity: string;
        before_data: unknown;
        after_data: unknown;
        created_at: string;
      }[]
    >([]);
  useEffect(() => {
    let live = true;
    Promise.all([
      supabase!.from("plans").select("*").order("monthly_price_cents"),
      supabase!.from("plan_features").select("*").order("code"),
      supabase!.from("plan_feature_links").select("*"),
      supabase!
        .from("platform_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]).then((results) => {
      if (!live) return;
      const fail = results.find((r) => r.error);
      if (fail) {
        setError(errorMessage(fail.error));
        return;
      }
      setPlans(results[0].data ?? []);
      setFeatures(results[1].data ?? []);
      setLinks(results[2].data ?? []);
      setAudit(results[3].data ?? []);
    });
    return () => {
      live = false;
    };
  }, [revision]);
  const saved = () => {
    setNotice(tx("Saved. Public pricing and package permissions are updated."));
    setRevision((x) => x + 1);
    onChange();
  };
  return (
    <section className="panel package-editor" id="platform-packages">
      <div className="section-heading">
        <div>
          <h2>{tx("Packages, prices & features")}</h2>
          <p>
            {tx(
              "Changes affect every restaurant assigned to the package. Existing records are kept when limits are lowered; new additions are blocked at the new limit.",
            )}
          </p>
        </div>
        <Button
          onClick={() =>
            setEdit({
              id: "",
              name: "",
              table_limit: 15,
              staff_limit: 10,
              menu_limit: 100,
              monthly_price_cents: 0,
              currency: "EUR",
              description: "",
              description_tr: "",
              published: true,
            })
          }
        >
          {tx("Add package")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <ToastBridge message={notice} />
      <ToastBridge message={error} kind="error" />
      <div className="catalogue-list">
        {plans.map((p) => (
          <button type="button" key={p.id} onClick={() => setEdit(p)}>
            <strong>{tx(p.name)}</strong>
            <span>
              {p.monthly_price_cents / 100} {p.currency} /{" "}
              <span>{tx("month")}</span>
            </span>
            <span>{p.published ? tx("Published") : tx("Hidden")}</span>
          </button>
        ))}
      </div>
      {edit && (
        <form
          key={edit.id}
          className="catalogue-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await rpc("platform_save_plan", {
                p_id: String(f.get("id")),
                p_data: {
                  name: f.get("name"),
                  monthly_price_cents: Math.round(Number(f.get("price")) * 100),
                  currency: f.get("currency"),
                  table_limit: Number(f.get("tables")),
                  staff_limit: Number(f.get("staff")),
                  menu_limit: Number(f.get("menu")),
                  description: f.get("description"),
                  description_tr: f.get("description_tr"),
                  published: f.has("published"),
                },
                p_features: f.getAll("features"),
              });
              setEdit(null);
              saved();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>{edit.id ? tx("Edit package") : tx("New package")}</h3>
          <div className="form-grid">
            <Field label={tx("Package identifier")}>
              <input
                name="id"
                required
                pattern="[a-z][a-z0-9_\-]{2,60}"
                readOnly={!!edit.id}
                defaultValue={edit.id}
              />
            </Field>
            <Field label={tx("Package name")}>
              <input
                name="name"
                maxLength={100}
                required
                defaultValue={edit.name}
              />
            </Field>
            <Field label={tx("Monthly price")}>
              <input
                name="price"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                required
                defaultValue={edit.monthly_price_cents / 100}
              />
            </Field>
            <Field label={tx("Currency")}>
              <select name="currency" defaultValue={edit.currency}>
                {["EUR", "USD", "GBP", "TRY"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            {[
              ["tables", tx("Table limit"), edit.table_limit],
              ["staff", tx("Staff limit"), edit.staff_limit],
              ["menu", tx("Menu item limit"), edit.menu_limit],
            ].map(([name, label, value]) => (
              <Field key={name} label={String(label)}>
                <input
                  name={String(name)}
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  required
                  defaultValue={value}
                />
              </Field>
            ))}
          </div>
          <Field label={tx("English description")}>
            <textarea
              name="description"
              maxLength={600}
              defaultValue={edit.description}
            />
          </Field>
          <Field label={tx("Turkish description")}>
            <textarea
              name="description_tr"
              maxLength={600}
              defaultValue={edit.description_tr}
            />
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              name="published"
              defaultChecked={edit.published}
            />
            {tx("Show on public pricing page")}
          </label>
          <fieldset>
            <legend>{tx("Included features")}</legend>
            {features.map((f) => (
              <label key={f.code} className="check-label">
                <input
                  type="checkbox"
                  name="features"
                  value={f.code}
                  defaultChecked={links.some(
                    (l) => l.plan_id === edit.id && l.feature_code === f.code,
                  )}
                />
                {locale === "tr" ? f.name_tr : f.name}
                <small>
                  {f.builtin
                    ? tx("Enforced capability")
                    : tx("Catalogue description only")}
                </small>
              </label>
            ))}
          </fieldset>
          <p>
            {tx(
              "Disabling a supported feature blocks new actions on the server. Existing orders and data remain accessible. Unpublishing only hides the package from pricing.",
            )}
          </p>
          <Button disabled={busy}>{tx("Save package")}</Button>
          <Button type="button" variant="ghost" onClick={() => setEdit(null)}>
            {tx("Cancel")}
          </Button>
        </form>
      )}
      <div className="section-heading">
        <h3>{tx("Feature catalogue")}</h3>
        <Button
          variant="outline"
          onClick={() =>
            setFeatureEdit({
              code: "",
              name: "",
              name_tr: "",
              description: "",
              builtin: false,
            })
          }
        >
          {tx("Add feature description")}
        </Button>
      </div>
      <p>
        {tx(
          "Built-in capabilities control guest ordering, service requests, feedback and branding edits. Custom entries describe a package; they do not create new software functionality.",
        )}
      </p>
      <div className="catalogue-list">
        {features.map((f) => (
          <button key={f.code} onClick={() => setFeatureEdit(f)}>
            <strong>{locale === "tr" ? f.name_tr : f.name}</strong>
            <span>
              {f.builtin
                ? tx("Enforced capability")
                : tx("Catalogue description only")}
            </span>
          </button>
        ))}
      </div>
      {featureEdit && (
        <form
          key={featureEdit.code}
          className="catalogue-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await rpc("platform_save_feature", {
                p_code: f.get("code"),
                p_name: f.get("name"),
                p_name_tr: f.get("name_tr"),
                p_description: f.get("description"),
              });
              setFeatureEdit(null);
              saved();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>{tx("Edit feature description")}</h3>
          <Field label={tx("Feature identifier")}>
            <input
              name="code"
              pattern="[a-z][a-z0-9_]{2,60}"
              required
              readOnly={!!featureEdit.code}
              defaultValue={featureEdit.code}
            />
          </Field>
          <Field label={tx("English name")}>
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={featureEdit.name}
            />
          </Field>
          <Field label={tx("Turkish name")}>
            <input
              name="name_tr"
              required
              maxLength={100}
              defaultValue={featureEdit.name_tr}
            />
          </Field>
          <Field label={tx("Description")}>
            <textarea
              name="description"
              maxLength={500}
              defaultValue={featureEdit.description}
            />
          </Field>
          <Button disabled={busy}>{tx("Save feature")}</Button>
          <Button
            variant="ghost"
            type="button"
            onClick={() => setFeatureEdit(null)}
          >
            {tx("Cancel")}
          </Button>
        </form>
      )}
      <h3>{tx("Transparent change history")}</h3>
      <p>
        {tx(
          "Latest 50 app-admin changes, with actor ID and before/after values. Raw keys and IDs are retained for auditing.",
        )}
      </p>
      {audit.map((a) => (
        <details key={a.id}>
          <summary>
            {a.created_at} · {a.event} · {a.entity}
          </summary>
          <p>
            {tx("Actor ID:")}
            {a.actor_id}
          </p>
          <pre>
            {JSON.stringify(
              { before: a.before_data, after: a.after_data },
              null,
              2,
            )}
          </pre>
        </details>
      ))}
      {!audit.length && <p>{tx("No recorded changes yet.")}</p>}
    </section>
  );
}
