#!/usr/bin/env node
/**
 * Real Storage API integration check for server-enforced MIME and file-size limits.
 * Run against a disposable local Supabase instance with a valid test user's JWT:
 * SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... P302_TEST_ACCESS_TOKEN=... P302_TEST_USER_ID=... npm run db:test-photo-upload-limits
 */
import { randomUUID } from 'node:crypto';

const { SUPABASE_URL, SUPABASE_ANON_KEY, P302_TEST_ACCESS_TOKEN, P302_TEST_USER_ID } = process.env;
if (![SUPABASE_URL, SUPABASE_ANON_KEY, P302_TEST_ACCESS_TOKEN, P302_TEST_USER_ID].every(Boolean)) {
  console.error('Missing SUPABASE_URL, SUPABASE_ANON_KEY, P302_TEST_ACCESS_TOKEN, or P302_TEST_USER_ID.');
  process.exit(2);
}
const base = SUPABASE_URL.replace(/\/$/, '');
const headers = { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${P302_TEST_ACCESS_TOKEN}` };
const prefix = `${P302_TEST_USER_ID}/p302-upload-limit-${randomUUID()}`;
const identityResponse = await fetch(`${base}/auth/v1/user`, { headers });
if (!identityResponse.ok) { console.error(`Test user token is invalid (HTTP ${identityResponse.status}).`); process.exit(2); }
const identity = await identityResponse.json();
if (identity.id !== P302_TEST_USER_ID) { console.error('P302_TEST_USER_ID does not match the supplied bearer token.'); process.exit(2); }

async function attemptUpload(path, mime, body) {
  return fetch(`${base}/storage/v1/object/profile_photos/${path}`, {
    method: 'POST', headers: { ...headers, 'content-type': mime, 'x-upsert': 'false' }, body,
  });
}
async function removeUnexpectedObject(path) {
  await fetch(`${base}/storage/v1/object/profile_photos`, {
    method: 'DELETE', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }),
  });
}

const cases = [
  { label: 'disallowed image/gif content type', path: `${prefix}-bad-type.gif`, mime: 'image/gif', body: new Uint8Array([71,73,70,56,57,97]) },
  { label: 'JPEG larger than 5 MiB', path: `${prefix}-too-large.jpg`, mime: 'image/jpeg', body: new Uint8Array(5 * 1024 * 1024 + 1) },
];
let failures = 0;
for (const test of cases) {
  const response = await attemptUpload(test.path, test.mime, test.body);
  if (response.ok) {
    await removeUnexpectedObject(test.path);
    console.error(`FAIL: Storage accepted ${test.label} (HTTP ${response.status}); attempted cleanup.`);
    failures += 1;
  } else {
    const errorBody = await response.text();
    const expectedError = test.mime === 'image/gif' ? /mime|content.?type|media|unsupported|type/i : /size|large|limit|payload|maximum|exceed/i;
    if ([401, 403, 404].includes(response.status) || !expectedError.test(errorBody)) {
      console.error(`FAIL: Storage rejected ${test.label} for an unexpected reason (HTTP ${response.status}): ${errorBody}`);
      failures += 1;
    } else {
      console.log(`PASS: Storage rejected ${test.label} (HTTP ${response.status}).`);
    }
  }
}
if (failures) process.exit(1);
console.log('Storage upload MIME/size integration checks passed.');
