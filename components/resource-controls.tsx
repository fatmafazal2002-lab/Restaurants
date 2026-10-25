"use client";
import { useState } from "react";
import { translateText as tx } from "@/lib/translation";
import { usePreferences } from "./preferences";
import { rpc } from "@/lib/supabase";
import { Button } from "./ui/button";
import { Field, Modal } from "./shared";
export function ResourceControls({
  restaurantId,
  id,
  name,
  kind,
  removed = false,
  run,
}: {
  restaurantId: string;
  id: string;
  name: string;
  kind: "table" | "menu" | "category";
  removed?: boolean;
  run: (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
}) {
  usePreferences();
  const [mode, setMode] = useState<"edit" | "delete" | null>(null),
    [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const apply = async (p_name: string | null, p_delete: boolean) => {
    setBusy(true);
    setFailed(false);
    const ok = await run(
      () =>
        rpc("manage_restaurant_resource", {
          p_restaurant: restaurantId,
          p_kind: kind,
          p_id: id,
          p_name,
          p_delete,
        }),
      tx("Saved successfully"),
    );
    if (ok) setMode(null);
    else setFailed(true);
    setBusy(false);
  };
  return (
    <>
      <div className="resource-actions">
        {kind !== "menu" && !removed && (
          <Button variant="outline" size="sm" onClick={() => setMode("edit")}>
            {tx("Edit")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setMode("delete")}>
          {tx(removed ? "Restore" : "Delete")}
        </Button>
      </div>
      {mode && (
        <Modal
          title={tx(mode === "edit" ? "Edit" : removed ? "Restore" : "Delete")}
          close={() => setMode(null)}
        >
          {failed && (
            <p role="alert" className="error-text">
              {tx(
                "Could not save. Check your access and package limits, then try again.",
              )}
            </p>
          )}
          {mode === "edit" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void apply(
                  String(new FormData(e.currentTarget).get("name")),
                  false,
                );
              }}
            >
              <Field label={tx("Name")}>
                <input
                  name="name"
                  required
                  maxLength={kind === "table" ? 40 : 80}
                  defaultValue={name}
                />
              </Field>
              <Button disabled={busy}>{tx("Save changes")}</Button>
            </form>
          ) : (
            <>
              <h3>{name}</h3>
              <p>
                {tx(
                  removed
                    ? "Restore this item?"
                    : kind === "category"
                      ? "Remove this category? Its dishes will become uncategorized."
                      : "Remove this item from active service? Past order records are preserved.",
                )}
              </p>
              <Button
                variant={removed ? "default" : "destructive"}
                disabled={busy}
                onClick={() => void apply(null, !removed)}
              >
                {tx(removed ? "Restore" : "Delete")}
              </Button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
