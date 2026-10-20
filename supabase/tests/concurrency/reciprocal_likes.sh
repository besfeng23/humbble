#!/usr/bin/env bash
# Exercise reciprocal-like concurrency with two independent host-side psql
# clients. Run after `supabase start` and `supabase db reset`.
set -Eeuo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -q)

ALPHA='00000000-0000-0000-0000-000000000021'
BRAVO='00000000-0000-0000-0000-000000000022'
ALPHA_EMAIL='p202-concurrency-alpha@example.test'
BRAVO_EMAIL='p202-concurrency-bravo@example.test'
APP_A='p202_concurrency_alpha'
APP_B='p202_concurrency_bravo'
TMP_DIR="$(mktemp -d)"
PID_A=''
PID_B=''

cleanup() {
  local code=$?
  [[ -n "$PID_A" ]] && kill "$PID_A" 2>/dev/null || true
  [[ -n "$PID_B" ]] && kill "$PID_B" 2>/dev/null || true
  if [[ -n "$PID_A" ]]; then wait "$PID_A" 2>/dev/null || true; fi
  if [[ -n "$PID_B" ]]; then wait "$PID_B" 2>/dev/null || true; fi
  # Remove only this script's reserved synthetic test users.
  "${PSQL[@]}" > /dev/null <<SQL || true
DELETE FROM auth.users WHERE id IN ('$ALPHA', '$BRAVO');
SQL
  rm -rf "$TMP_DIR"
  exit "$code"
}
trap cleanup EXIT INT TERM

# Ensure repeatable use after a previous interrupted execution.
"${PSQL[@]}" <<SQL
DELETE FROM auth.users WHERE id IN ('$ALPHA', '$BRAVO');
INSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES
  ('$ALPHA', 'authenticated', 'authenticated', '$ALPHA_EMAIL', now(), now()),
  ('$BRAVO', 'authenticated', 'authenticated', '$BRAVO_EMAIL', now(), now());
INSERT INTO public.profiles
  (id, display_name, birth_date, verification_status, is_discoverable, is_suspended)
VALUES
  ('$ALPHA', 'P2 Race Alpha', DATE '1990-01-01', 'verified', TRUE, FALSE),
  ('$BRAVO', 'P2 Race Bravo', DATE '1990-01-02', 'verified', TRUE, FALSE);
SQL

# Session A opens an explicit transaction, inserts one side of the pair, and
# holds it briefly so session B races an independent reciprocal insert.
cat > "$TMP_DIR/alpha.sql" <<SQL
BEGIN;
SET application_name = '$APP_A';
INSERT INTO public.swipes (actor_id, target_id, direction)
VALUES ('$ALPHA', '$BRAVO', 'like');
SELECT pg_sleep(0.6);
COMMIT;
SQL
cat > "$TMP_DIR/bravo.sql" <<SQL
SET application_name = '$APP_B';
SELECT pg_sleep(0.15);
INSERT INTO public.swipes (actor_id, target_id, direction)
VALUES ('$BRAVO', '$ALPHA', 'like');
SQL

"${PSQL[@]}" -f "$TMP_DIR/alpha.sql" > "$TMP_DIR/alpha.out" 2> "$TMP_DIR/alpha.err" &
PID_A=$!
"${PSQL[@]}" -f "$TMP_DIR/bravo.sql" > "$TMP_DIR/bravo.out" 2> "$TMP_DIR/bravo.err" &
PID_B=$!

if ! wait "$PID_A"; then
  cat "$TMP_DIR/alpha.out" "$TMP_DIR/alpha.err" >&2
  exit 1
fi
PID_A=''
if ! wait "$PID_B"; then
  cat "$TMP_DIR/bravo.out" "$TMP_DIR/bravo.err" >&2
  exit 1
fi
PID_B=''

# Query globally as the migration/test owner. Exact cardinalities are required.
actual="$("${PSQL[@]}" -At <<SQL
SELECT
  (SELECT count(*) FROM public.matches WHERE user_a_id = LEAST('$ALPHA'::uuid, '$BRAVO'::uuid) AND user_b_id = GREATEST('$ALPHA'::uuid, '$BRAVO'::uuid))::text || '|' ||
  (SELECT count(*) FROM public.conversations c JOIN public.matches m ON m.id = c.match_id WHERE m.user_a_id = LEAST('$ALPHA'::uuid, '$BRAVO'::uuid) AND m.user_b_id = GREATEST('$ALPHA'::uuid, '$BRAVO'::uuid))::text || '|' ||
  (SELECT count(*) FROM public.conversation_participants cp JOIN public.conversations c ON c.id = cp.conversation_id JOIN public.matches m ON m.id = c.match_id WHERE m.user_a_id = LEAST('$ALPHA'::uuid, '$BRAVO'::uuid) AND m.user_b_id = GREATEST('$ALPHA'::uuid, '$BRAVO'::uuid))::text;
SQL
)"

if [[ "$actual" != '1|1|2' ]]; then
  printf 'reciprocal-like concurrency invariant failed: expected 1 match, 1 conversation, 2 participants; got %s\n' "$actual" >&2
  exit 1
fi
printf 'reciprocal-like concurrency invariant passed: %s (matches|conversations|participants)\n' "$actual"
