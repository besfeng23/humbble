#!/usr/bin/env bash
# Race 20 host-side psql calls against the atomic free-like quota.
# Run only against the disposable local Supabase database after db reset/pgTAP.
set -Eeuo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAt)
ACTOR='00000000-0000-0000-0000-000000000051'
TMP_DIR="$(mktemp -d)"
PIDS=()
UNEXPECTED=0

uuid_for_number() {
  printf '00000000-0000-0000-0000-%012d' "$1"
}

cleanup() {
  local code=$?
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  for pid in "${PIDS[@]:-}"; do
    wait "$pid" 2>/dev/null || true
  done
  # Cascade-clean this script's reserved synthetic users; do not mutate any
  # application tables directly or touch Supabase Storage tables.
  "${PSQL[@]}" >/dev/null <<SQL || true
DELETE FROM auth.users WHERE id IN (
$(for n in $(seq 51 71); do printf "  '%s',\n" "$(uuid_for_number "$n")"; done | sed '$ s/,$//')
);
SQL
  rm -rf "$TMP_DIR"
  exit "$code"
}
trap cleanup EXIT INT TERM

# Remove leftovers after an interrupted prior run, then create actor + 20 targets.
{
  printf 'DELETE FROM auth.users WHERE id IN (\n'
  for n in $(seq 51 71); do
    comma=','; [[ "$n" == 71 ]] && comma=''
    printf "  '%s'%s\n" "$(uuid_for_number "$n")" "$comma"
  done
  printf ');\nINSERT INTO auth.users (id, aud, role, email, created_at, updated_at) VALUES\n'
  for n in $(seq 51 71); do
    comma=','; [[ "$n" == 71 ]] && comma=''
    printf "  ('%s', 'authenticated', 'authenticated', 'p205-quota-%s@example.test', now(), now())%s\n" "$(uuid_for_number "$n")" "$n" "$comma"
  done
  printf ';\nINSERT INTO public.profiles (id, display_name, birth_date, verification_status, is_discoverable, is_suspended) VALUES\n'
  for n in $(seq 51 71); do
    comma=','; [[ "$n" == 71 ]] && comma=''
    printf "  ('%s', 'Quota User %s', DATE '1990-01-01', 'verified', TRUE, FALSE)%s\n" "$(uuid_for_number "$n")" "$n" "$comma"
  done
  printf ';\n'
} | "${PSQL[@]}"

run_one() {
  local target="$1" index="$2"
  local status_file="$TMP_DIR/status.$index"
  if "${PSQL[@]}" >"$TMP_DIR/out.$index" 2>"$TMP_DIR/err.$index" <<SQL
SET ROLE authenticated;
SET "request.jwt.claims" = '{"sub":"$ACTOR","role":"authenticated"}';
SELECT * FROM public.record_swipe('$target'::UUID, 'like'::public.swipe_direction);
SQL
  then
    if [[ -s "$TMP_DIR/out.$index" ]]; then
      printf 'success\n' > "$status_file"
    else
      printf 'unexpected_empty_result\n' > "$status_file"
      return 1
    fi
  elif grep -Fq 'quota_exceeded' "$TMP_DIR/err.$index"; then
    printf 'quota_exceeded\n' > "$status_file"
  else
    printf 'unexpected_error\n' > "$status_file"
    cat "$TMP_DIR/err.$index" >&2
    return 1
  fi
}

for n in $(seq 52 71); do
  idx=$((n - 51))
  run_one "$(uuid_for_number "$n")" "$idx" &
  PIDS+=("$!")
done

for pid in "${PIDS[@]}"; do
  if ! wait "$pid"; then
    UNEXPECTED=1
  fi
done
PIDS=()

if [[ "$UNEXPECTED" -ne 0 ]]; then
  printf 'unexpected psql client failure during swipe quota race\n' >&2
  exit 1
fi

successes="$(grep -l '^success$' "$TMP_DIR"/status.* 2>/dev/null | wc -l | tr -d ' ')"
quota_failures="$(grep -l '^quota_exceeded$' "$TMP_DIR"/status.* 2>/dev/null | wc -l | tr -d ' ')"
actual="$("${PSQL[@]}" <<SQL
SELECT
  (SELECT likes_used FROM public.daily_swipe_quotas WHERE user_id = '$ACTOR'::UUID AND quota_date = (now() AT TIME ZONE 'UTC')::DATE)::TEXT || '|' ||
  (SELECT count(*)::TEXT FROM public.swipes WHERE actor_id = '$ACTOR'::UUID AND direction = 'like');
SQL
)"
IFS='|' read -r likes_used swipe_rows <<< "$actual"

if [[ "$successes" != '15' || "$quota_failures" != '5' || "$likes_used" != '15' || "$swipe_rows" != '15' ]]; then
  printf 'swipe quota invariant failed: successes=%s quota_exceeded=%s likes_used=%s swipe_rows=%s (expected 15|5|15|15)\n' \
    "$successes" "$quota_failures" "$likes_used" "$swipe_rows" >&2
  exit 1
fi
printf 'swipe quota invariant passed: 15|5|15\n'
