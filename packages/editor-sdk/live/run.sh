#!/usr/bin/env bash
# Interactive runner for the live Google Docs check; see
# google_docs_rest_check.ts. The token is read without echo and is passed to
# Deno through the environment of this process only.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v deno >/dev/null 2>&1; then
  echo "Deno 2 is required: https://docs.deno.com/runtime/getting_started/installation/" >&2
  exit 2
fi

printf 'Google Docs document URL or ID: ' >&2
IFS= read -r GOOGLE_DOCS_DOCUMENT_ID
printf 'Access token (input hidden): ' >&2
IFS= read -rs GOOGLE_DOCS_ACCESS_TOKEN
printf '\n' >&2
export GOOGLE_DOCS_DOCUMENT_ID GOOGLE_DOCS_ACCESS_TOKEN

exec deno task live:rest
