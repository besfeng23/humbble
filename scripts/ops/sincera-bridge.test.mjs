import { test } from "node:test";
import assert from "node:assert/strict";
import { GET as me } from "../../api/sincera/me.mjs";
import { GET as health } from "../../api/sincera/health.mjs";

const oldFetch = globalThis.fetch;
const oldUrl = process.env.SUPABASE_URL;
const oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const userId = "d539c18e-5a1b-4bc1-a219-b9cb846bb28c";
const jwt = "sample.jwt.validlength_for_mock";
const request = (token) => new Request("https://example.invalid/api/sincera/me", {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
});

test("missing bearer token fails without calling upstream", async () => {
  globalThis.fetch = () => { throw new Error("should not fetch"); };
  const r = await me(request());
  assert.equal(r.status, 401);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
});
test("missing configuration fails closed", async () => {
  delete process.env.SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  assert.equal((await me(request(jwt))).status, 503);
});
test("invalid Supabase identity fails closed", async () => {
  process.env.SUPABASE_URL = "https://bthfgwxgusizfjtmcacc.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mock";
  globalThis.fetch = async () => new Response("{}", { status: 401 });
  const r = await me(request(jwt));
  assert.equal(r.status, 401);
});
test("verified member can access only their RLS-scoped profile", async () => {
  let requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), authorization: options.headers.authorization });
    if (String(url).includes("/auth/v1/user")) {
      return Response.json({ id: userId });
    }
    return Response.json([{ id: userId, display_name: "Test member", verification_status: "pending" }]);
  };
  const r = await me(request(jwt));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).member.profile.display_name, "Test member");
  assert.equal(requests.length, 2);
  assert.ok(requests[1].url.includes(`id=eq.${userId}`));
  assert.equal(requests[1].authorization, `Bearer ${jwt}`);
});
test("unexpected returned profile ID is never disclosed", async () => {
  globalThis.fetch = async url => String(url).includes("/auth/v1/user")
    ? Response.json({ id: userId })
    : Response.json([{ id: "d539c18e-5a1b-4bc1-a219-b9cb846bb28d", display_name: "other user" }]);
  const r = await me(request(jwt));
  assert.equal(r.status, 503);
  assert.equal((await r.json()).error, "service_unavailable");
});
test("health does not emit project URLs or credentials", async () => {
  globalThis.fetch = async () => new Response("healthy", { status: 200 });
  const r = await health();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: "ok", service: "sincera-supabase-bridge" });
});
test("cleanup", () => {
  globalThis.fetch = oldFetch;
  if (oldUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = oldUrl;
  if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
  else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
});
