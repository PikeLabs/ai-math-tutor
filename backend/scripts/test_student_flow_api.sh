#!/usr/bin/env bash
# Quick smoke-test for the student flow API endpoints
set -euo pipefail

BASE_URL="http://localhost:5000/api"

have_jq() { command -v jq >/dev/null 2>&1; }
pp() { if have_jq; then jq .; else cat; fi; }

req() {
  # usage: req METHOD PATH [JSON_BODY]
  local method="$1"; shift
  local path="$1"; shift
  local body="${1:-}"

  echo
  echo "=== ${method} ${path} ==="
  if [[ -n "$body" ]]; then
    resp="$(curl -sS -w '\n%{http_code}' -H 'Content-Type: application/json' -H 'Accept: application/json' -X "$method" "$BASE_URL$path" -d "$body")"
  else
    resp="$(curl -sS -w '\n%{http_code}' -H 'Accept: application/json' -X "$method" "$BASE_URL$path")"
  fi

  # split body / status
  status="${resp##*$'\n'}"
  body="${resp%$'\n'$status}"

  echo "HTTP $status"
  echo "$body" | pp

  echo "$status" > /tmp/http_status
  echo "$body" > /tmp/http_body
}

# 1) Health
req GET "/health"

# 2) Create session
req POST "/session/create" '{"studentName":"Ada Lovelace","slideCount":10,"pdfUrl":"http://example.com/ada.pdf"}'

# Extract sessionId / studentId if JSON; bail with helpful error otherwise
SESSION_ID=""
STUDENT_ID=""
if have_jq; then
  SESSION_ID="$(jq -r 'try .sessionId // empty' < /tmp/http_body || true)"
  STUDENT_ID="$(jq -r 'try .studentId // empty' < /tmp/http_body || true)"
fi

if [[ -z "${SESSION_ID}" ]]; then
  echo "!! Could not parse sessionId from create-session response. Check backend logs."
  exit 1
fi
echo "Using sessionId=${SESSION_ID} studentId=${STUDENT_ID:-unknown}"

# 3) Log a conversation turn
req POST "/session/${SESSION_ID}/conversations" '{"role":"student","content":"I think slide 2 proof skips a step.","slideNumber":2,"timestamp":"2025-08-19T20:45:00Z"}'

# 4) Save feedback
req POST "/feedback" "{\"sessionId\":${SESSION_ID},\"overallFeedback\":\"Great structure; tighten intro.\",\"presentationScore\":86}"

# 5) Professor list (show first item if jq exists)
req GET "/professor/sessions"
if have_jq; then
  echo "=== First item ==="
  jq '.[0]' < /tmp/http_body || true
fi

# 6) Session details
req GET "/professor/session/${SESSION_ID}"