/**
 * Read-only, public infrastructure probe. No user data, credentials or schema
 * details are returned. This is NOT an authentication or member-data endpoint.
 */
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export async function GET() {
  const rawUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  // Fail closed if the project is misconfigured.
  let url;
  try {
    url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.hostname !== "bthfgwxgusizfjtmcacc.supabase.co") {
      throw new Error("unexpected Supabase project");
    }
    if (!key || key.startsWith("sb_secret_")) throw new Error("missing publishable key");
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }

  try {
    const response = await fetch(new URL("/auth/v1/health", url), {
      method: "GET",
      headers: { apikey: key },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("upstream unhealthy");
    return Response.json({ status: "ok", service: "sincera-supabase-bridge" }, { status: 200, headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
