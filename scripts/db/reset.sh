#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"

# A set database URL is treated as an explicit destination and must be local.
for variable_name in SUPABASE_DB_URL DATABASE_URL; do
  destination="${!variable_name:-}"
  [[ -z "$destination" ]] && continue
  if ! host="$(node -e 'try { const url = new URL(process.argv[1]); process.stdout.write(url.hostname.replace(/^\[|\]$/g, "")); } catch { process.exit(2); }' "$destination")"; then
    printf 'Refusing db reset: %s is not a valid URL.\n' "$variable_name" >&2
    exit 2
  fi
  case "$host" in
    127.0.0.1|localhost) ;;
    *) printf 'Refusing db reset: %s points to non-local host %s. Only localhost/127.0.0.1 are allowed.\n' "$variable_name" "$host" >&2; exit 2 ;;
  esac
done

exec supabase db reset
