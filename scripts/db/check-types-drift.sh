#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

tmp_file="$(mktemp)"
cleanup() { rm -f "$tmp_file"; }
trap cleanup EXIT

if ! supabase gen types typescript --local --schema public > "$tmp_file"; then
  printf '%s\n' 'Failed to generate local database types; the full temporary output follows:' >&2
  cat "$tmp_file" >&2
  exit 1
fi

if ! diff -u lib/database.types.ts "$tmp_file"; then
  printf '%s\n' 'database types are stale: run npm run db:types' >&2
  printf '%s\n' '----- BEGIN FULL GENERATED lib/database.types.ts (CI diagnostic) -----' >&2
  cat "$tmp_file" >&2
  printf '%s\n' '----- END FULL GENERATED lib/database.types.ts (CI diagnostic) -----' >&2
  exit 1
fi
printf '%s\n' 'Generated database types are current.'
