import { test, after } from "node:test";
import assert from "node:assert/strict";
import { POST, OPTIONS } from "../../api/sincera/link-identity.mjs";

const snapshot = new Map([
  "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY", "SINCERA_BUBBLE_WHOAMI_URL",
  "SINCERA_ALLOWED_ORIGIN", "VERCEL_ENV",
].map(k => [k, process.env[k]]));
const originalFetch = globalThis.fetch;
const userId = "d539c18e-5a1b-4bc1-a219-b9cb846bb28c";
const bubbleId = "1792797878406x182755383144770140";
const supabaseToken = "supabase.jwt.mock_for_member_only";
const bubbleToken = "bubble.member.mock_for_member_only";
const allowedOrigin = "https://sincera.bubbleapps.io";

const req = (options = {}) => new Request("https://humbble.test/api/sincera/link-identity", {
  method: options.method || "POST",
  headers: {
    "Origin": options.origin ?? allowedOrigin,
    "Authorization": `Bearer ${options.supabaseToken ?? supabaseToken}`,
    "X-Sincera-Bubble-Token": `Bearer ${options.bubbleToken ?? bubbleToken}`,
    ...options.headers,
  },
});
const initialize = () => {
  process.env.SUPABASE_URL = "https://bthfgwxgusizfjtmcacc.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mock";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_mock_not_a_real_key";
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SINCERA_BUBBLE_WHOAMI_URL =
    "https://sincera.bubbleapps.io/version-test/api/1.1/wf/sincera_identity_whoami";
  process.env.SINCERA_ALLOWED_ORIGIN = allowedOrigin;
  process.env.VERCEL_ENV = "preview";
};
const mock = ({
  bubble = { bubble_user_id: bubbleId, adult_eligible: "yes",
             access_removed: "no", email_confirmed: "yes" },
  user = { id: userId, email_confirmed_at: "2026-10-25T00:00:00Z" },
  bubbleStatus = 200,
  supabaseStatus = 200,
  rpcStatus = 200,
} = {}) => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const dest = String(url);
    calls.push({ dest, options });
    if (dest.endsWith("/auth/v1/user")) return Response.json(user, { status: supabaseStatus });
    if (dest.includes("/wf/sincera_identity_whoami"))
      return Response.json({ status: "success", response: bubble }, { status: bubbleStatus });
    if (dest.includes("/rpc/sincera_activate_bubble_link"))
      return Response.json(true, { status: rpcStatus });
    throw new Error("unexpected endpoint");
  };
  return calls;
};
after(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of snapshot) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
test("missing either member bearer fails before upstream access", async () => {
  initialize();
  globalThis.fetch = () => { throw new Error("network must not be called"); };
  const r = await POST(req({ headers: { "X-Sincera-Bubble-Token": "" } }));
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error, "two_member_sessions_required");
});
test("untrusted browser origins are rejected without touching providers", async () => {
  initialize();
  globalThis.fetch = () => { throw new Error("network must not be called"); };
  const r = await POST(req({ origin: "https://attacker.invalid" }));
  assert.equal(r.status, 403);
  assert.equal(r.headers.get("access-control-allow-origin"), null);
});
test("preflight is allowed only for the configured Bubble origin", async () => {
  initialize();
  const r = await OPTIONS(req({ method: "OPTIONS" }));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-origin"), allowedOrigin);
  assert.equal((await OPTIONS(req({ method: "OPTIONS", origin: "https://attacker.invalid" }))).status, 403);
});
test("link fails closed when privileged key is not installed", async () => {
  initialize();
  delete process.env.SUPABASE_SECRET_KEY;
  globalThis.fetch = () => { throw new Error("network must not be called"); };
  assert.equal((await POST(req())).status, 503);
});
test("production may not accidentally use development Bubble sessions", async () => {
  initialize();
  process.env.VERCEL_ENV = "production";
  globalThis.fetch = () => { throw new Error("network must not be called"); };
  assert.equal((await POST(req())).status, 503);
});
test("successful link needs two verified adult member identities", async () => {
  initialize();
  const calls = mock();
  const r = await POST(req());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { linked: true });
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(calls.length, 3);
  assert.ok(calls[0].dest.endsWith("/auth/v1/user"));
  assert.ok(calls[1].dest.includes("/wf/sincera_identity_whoami"));
  assert.equal(calls[0].options.headers.authorization, `Bearer ${supabaseToken}`);
  assert.equal(calls[1].options.headers.authorization, `Bearer ${bubbleToken}`);
  assert.ok(calls[2].dest.includes("/rest/v1/rpc/sincera_activate_bubble_link"));
  assert.equal(calls[2].options.headers.apikey, "sb_secret_mock_not_a_real_key");
  assert.equal(calls[2].options.headers.authorization, undefined);
  const rpcInput = JSON.parse(calls[2].options.body);
  assert.equal(rpcInput.p_bubble_user_id, bubbleId);
  assert.equal(rpcInput.p_supabase_user_id, userId);
  assert.match(rpcInput.p_evidence_reference, /^[0-9a-f-]{36}$/i);
  assert.ok(!calls[2].options.body.includes(supabaseToken));
  assert.ok(!calls[2].options.body.includes(bubbleToken));
});
test("invalid Bubble member token fails without writing", async () => {
  initialize();
  const calls = mock({ bubbleStatus: 401 });
  assert.equal((await POST(req())).status, 401);
  assert.equal(calls.length, 2);
});
test("Supabase identity lacking confirmed email cannot link", async () => {
  initialize();
  const calls = mock({ user: { id: userId } });
  assert.equal((await POST(req())).status, 403);
  assert.equal(calls.length, 2);
});
test("non-adult Bubble member cannot link", async () => {
  initialize();
  const calls = mock({ bubble: { bubble_user_id: bubbleId, adult_eligible: "no",
    email_confirmed: "yes", access_removed: "no" } });
  assert.equal((await POST(req())).status, 403);
  assert.equal(calls.length, 2);
});
test("banned Bubble member cannot link", async () => {
  initialize();
  const calls = mock({ bubble: { bubble_user_id: bubbleId, adult_eligible: "yes",
    email_confirmed: "yes", access_removed: "yes" } });
  assert.equal((await POST(req())).status, 403);
  assert.equal(calls.length, 2);
});
test("malformed Bubble identity never results in a write", async () => {
  initialize();
  const calls = mock({ bubble: { bubble_user_id: "someone-else",
    adult_eligible: "yes", email_confirmed: "yes", access_removed: "no" } });
  assert.equal((await POST(req())).status, 401);
  assert.equal(calls.length, 2);
});
test("RPC conflict returns generic 409 with no PII", async () => {
  initialize();
  const calls = mock({ rpcStatus: 409 });
  const r = await POST(req());
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "account_link_conflict" });
  assert.equal(calls.length, 3);
});
test("provider transport failure never leaks upstream errors", async () => {
  initialize();
  globalThis.fetch = () => { throw new Error("UPSTREAM_USER_SECRET"); };
  const r = await POST(req());
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(await r.json()).includes("UPSTREAM_USER_SECRET"));
});
