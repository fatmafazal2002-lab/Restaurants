import { supabase } from "./supabase";
export async function employeeApi<T>(
  path: "provision" | "complete",
  body: Record<string, unknown>,
): Promise<T> {
  const { data } = await supabase!.auth.getSession();
  if (!data.session) throw new Error("Sign in required");
  const response = await fetch(`/api/employees/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
