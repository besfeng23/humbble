#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(git rev-parse --show-toplevel)"
exec supabase db lint --local --level warning --fail-on error
