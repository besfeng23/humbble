/**
 * Authenticated read-only bridge. Accepts ONLY a Supabase Auth access token
 * for the existing Humbble project, not a Bubble user ID or admin/API key.
 * Supabase validates the token; profile access is executed with that same
 * user token under its existing Row Level Security policies.
 */
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
  "vary": "Authorization",
  "x-content-type-options": "nosniff",
};
const json = (status, body) => Response.json(body, { status, headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer ([a-zA-Z0-9._-]{20,8192})$/.exec(authorization);
  if (!match) return json(401, { error: "authentication_required" });
  const token = match[1];

  const rawUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  let root;
  try {
    root = new URL(rawUrl);
    if (root.protocol !== "https:" || root.hostname !== "bthfgwxgusizfjtmcacc.supabase.co") {
      throw new Error("unexpected Supabase project");
    }
    if (!key || key.startsWith("sb_secret_")) throw new Error("publishable key required");
  } catch {
    return json(503, { error: "service_unavailable" });
  }

  const requestHeaders = { apikey: key, authorization: `Bearer ${token}` };
  try {
    const identityResponse = await fetch(new URL("/auth/v1/user", root), {
      method: "GET", headers: requestHeaders, redirect: "error",
      cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (identityResponse.status === 401 || identityResponse.status === 403) {
      return json(401, { error: "invalid_session" });
    }
    if (!identityResponse.ok) return json(503, { error: "service_unavailable" });
    const user = await identityResponse.json();
    if (!UUID.test(user?.id || "")) return json(401, { error: "invalid_session" });

    const profileUrl = new URL("/rest/v1/profiles", root);
    profileUrl.searchParams.set("id", `eq.${user.id}`);
    profileUrl.searchParams.set("select", "id,display_name,verification_status");
    const profileResponse = await fetch(profileUrl, {
      method: "GET",
      headers: { ...requestHeaders, accept: "application/json" },
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (profileResponse.status === 401) return json(401, { error: "invalid_session" });
    if (profileResponse.status === 403) return json(403, { error: "access_denied" });
    if (!profileResponse.ok) return json(503, { error: "service_unavailable" });
    const profiles = await profileResponse.json();
    if (!Array.isArray(profiles) || profiles.some(p => p?.id !== user.id)) {
      return json(503, { error: "service_unavailable" });
    }
    const profile = profiles[0];
    return json(200, {
      authenticated: true,
      member: { id: user.id, profile: profile
        ? { display_name: profile.display_name, verification_status: profile.verification_status }
        : null },
    });
  } catch {
    // Never return upstream errors, access tokens, query bodies or secrets.
    return json(503, { error: "service_unavailable" });
  }
}
