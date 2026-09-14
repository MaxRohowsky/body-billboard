import { env } from "cloudflare:workers";

type SupabaseRequestInit = RequestInit & { headers?: HeadersInit };

function config() {
  const url = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) throw new Error("Supabase is not configured yet.");
  return { url, key };
}

export async function supabaseRequest(path: string, init: SupabaseRequestInit = {}) {
  const { url, key } = config();
  const headers = new Headers(init.headers);
  headers.set("apikey", key);
  if (key.startsWith("eyJ")) headers.set("authorization", `Bearer ${key}`);

  const response = await fetch(`${url}${path}`, { ...init, headers });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }
  return response;
}

export async function supabaseJson<T>(path: string, init: SupabaseRequestInit = {}) {
  const response = await supabaseRequest(path, init);
  return (await response.json()) as T;
}
