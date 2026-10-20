#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

tmp_file="$(mktemp)"
cleanup() { rm -f "$tmp_file"; }
trap cleanup EXIT

if ! supabase db diff --local > "$tmp_file" 2>&1; then
  cat "$tmp_file"
  printf '%s\n' 'Schema diff command failed.' >&2
  exit 1
fi

cat "$tmp_file"
if grep -Fq 'No schema changes found' "$tmp_file"; then
  printf '%s\n' 'Local database matches the migration chain.'
  exit 0
fi
printf '%s\n' 'Schema drift detected: local database differs from checked-in migrations.' >&2
exit 1
