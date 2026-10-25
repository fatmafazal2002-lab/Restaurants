"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { translateText as tx } from "@/lib/translation";
import { usePreferences } from "./preferences";
import { ResourceControls } from "./resource-controls";
import { errorMessage } from "@/lib/utils";
export function ArchivedMenu({
  restaurantId,
  run,
  revision,
}: {
  restaurantId: string;
  revision: string;
  run: (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
}) {
  usePreferences();
  const [items, setItems] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    supabase!
      .from("menu_items")
      .select("id,name")
      .eq("restaurant_id", restaurantId)
      .eq("archived", true)
      .then(({ data, error }) => {
        if (alive) {
          setError(error ? errorMessage(error) : "");
          setItems(data || []);
        }
      });
    return () => {
      alive = false;
    };
  }, [restaurantId, revision]);
  if (!items.length && !error) return null;
  return (
    <details className="panel">
      <summary>
        {tx("Archived menu items")} ({items.length})
      </summary>
      {error && <p role="alert">{error}</p>}
      {items.map((item) => (
        <div className="order-row" key={item.id}>
          <strong>{item.name}</strong>
          <ResourceControls
            restaurantId={restaurantId}
            id={item.id}
            name={item.name}
            kind="menu"
            removed
            run={run}
          />
        </div>
      ))}
    </details>
  );
}
