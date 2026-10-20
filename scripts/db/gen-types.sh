#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"
exec supabase gen types typescript --local --schema public > lib/database.types.ts
