/**
 * Sincera opt-in account linking: proof from two independent authenticated providers.
 *
 * This endpoint MUST NOT be called with a Bubble admin token. It obtains identity
 * only by calling the user-authenticated Bubble whoami workflow with the caller's
 * own Bubble member API bearer token, and separately queries Supabase Auth /user.
 * No email-matching, impersonation, password collection, or member-data migration.
 *
 * Deployment is fail-closed until a server-only Supabase secret key and the exact
 * Bubble whoami URL are configured; never use an EXPO_PUBLIC_* secret.
 */
const expectedProjectHost = "bthfgwxgusizfjtmcacc.supabase.co";
const expectedBubbleHost = "sincera.bubbleapps.io";
const bubbleWorkflowPath = /^(?:\/version-test)?\/api\/1\.1\/wf\/sincera_identity_whoami$/;
const bubbleId = /^[0-9]{13}x[0-9]{18}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "private, no-store",
  "x-content-type-options": "nosniff",
  "vary": "Authorization, Origin, X-Sincera-Bubble-Token",
};
const bearer = value => {
  const match = /^Bearer ([A-Za-z0-9._-]{24,8192})$/.exec(value || "");
  return match?.[1] || null;
};
const response = (status, body, cors = {}) =>
  Response.json(body, { status, headers: { ...SAFE_HEADERS, ...cors } });
const positive = value => value === true || value === "true" || value === "yes";
const negative = value => value === false || value === "false" || value === "no";

function originHeaders(request) {
  const origin = request.headers.get("origin");
  const allowed = process.env.SINCERA_ALLOWED_ORIGIN || "https://sincera.bubbleapps.io";
  if (origin && origin !== allowed) return null;
  return origin
    ? { "access-control-allow-origin": allowed, "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Authorization, X-Sincera-Bubble-Token, Content-Type" }
    : {};
}

function configuration() {
  const rawUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bubble = process.env.SINCERA_BUBBLE_WHOAMI_URL;
  try {
    const supabaseUrl = new URL(rawUrl);
    const bubbleUrl = new URL(bubble);
    if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname !== expectedProjectHost ||
        supabaseUrl.username || supabaseUrl.password || supabaseUrl.search ||
        bubbleUrl.protocol !== "https:" || bubbleUrl.hostname !== expectedBubbleHost ||
        bubbleUrl.username || bubbleUrl.password || bubbleUrl.search || bubbleUrl.hash ||
        !bubbleWorkflowPath.test(bubbleUrl.pathname) ||
        (process.env.VERCEL_ENV === "production" && bubbleUrl.pathname.startsWith("/version-test")) ||
        !publishable || publishable.startsWith("sb_secret_") ||
        !secret || !(secret.startsWith("sb_secret_") || secret.split(".").length === 3) ||
        secret === publishable) return null;
    return { supabaseUrl, bubbleUrl, publishable, secret };
  } catch {
    return null;
  }
}

const noRedirect = { method: "GET", redirect: "error", cache: "no-store" };
const timeout = () => AbortSignal.timeout(6000);

export async function OPTIONS(request) {
  const cors = originHeaders(request);
  if (!cors) return response(403, { error: "origin_not_allowed" });
  return new Response(null, { status: 204, headers: { ...SAFE_HEADERS, ...cors } });
}

export async function POST(request) {
  const cors = originHeaders(request);
  if (!cors) return response(403, { error: "origin_not_allowed" });
  const supabaseToken = bearer(request.headers.get("authorization"));
  const bubbleToken = bearer(request.headers.get("x-sincera-bubble-token"));
  if (!supabaseToken || !bubbleToken) {
    return response(401, { error: "two_member_sessions_required" }, cors);
  }
  const config = configuration();
  if (!config) return response(503, { error: "identity_link_not_configured" }, cors);

  try {
    const [supabaseResponse, bubbleResponse] = await Promise.all([
      fetch(new URL("/auth/v1/user", config.supabaseUrl), {
        ...noRedirect,
        headers: { apikey: config.publishable, authorization: `Bearer ${supabaseToken}` },
        signal: timeout(),
      }),
      fetch(config.bubbleUrl, {
        ...noRedirect,
        headers: { authorization: `Bearer ${bubbleToken}`, accept: "application/json" },
        signal: timeout(),
      }),
    ]);
    if ([401, 403].includes(supabaseResponse.status) || [401, 403].includes(bubbleResponse.status)) {
      return response(401, { error: "invalid_member_session" }, cors);
    }
    if (!supabaseResponse.ok || !bubbleResponse.ok) {
      return response(503, { error: "identity_provider_unavailable" }, cors);
    }

    const user = await supabaseResponse.json();
    const bubbleResult = await bubbleResponse.json();
    const member = bubbleResult?.response || bubbleResult;
    if (!uuid.test(user?.id || "") || !bubbleId.test(member?.bubble_user_id || "")) {
      return response(401, { error: "invalid_member_session" }, cors);
    }
    if (!user.email_confirmed_at || !positive(member?.email_confirmed) ||
        !positive(member?.adult_eligible) || !negative(member?.access_removed)) {
      return response(403, { error: "member_not_eligible_for_link" }, cors);
    }

    // An opaque correlation ID, never a copy of either bearer token or PII.
    const evidence = crypto.randomUUID();
    const headers = {
      apikey: config.secret,
      "content-type": "application/json",
      accept: "application/json",
    };
    if (!config.secret.startsWith("sb_secret_")) {
      headers.authorization = `Bearer ${config.secret}`;
    }
    const saved = await fetch(new URL("/rest/v1/rpc/sincera_activate_bubble_link", config.supabaseUrl), {
      method: "POST", headers, redirect: "error", cache: "no-store",
      body: JSON.stringify({
        p_bubble_user_id: member.bubble_user_id,
        p_supabase_user_id: user.id,
        p_evidence_reference: evidence,
      }),
      signal: timeout(),
    });
    if (saved.status === 409) return response(409, { error: "account_link_conflict" }, cors);
    if (!saved.ok) return response(503, { error: "identity_link_unavailable" }, cors);
    return response(200, { linked: true }, cors);
  } catch {
    return response(503, { error: "identity_link_unavailable" }, cors);
  }
}
