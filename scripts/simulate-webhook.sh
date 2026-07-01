#!/usr/bin/env bash
# Simulates a real GitHub issue webhook with a valid HMAC-SHA256 signature.
# Usage: bash scripts/simulate-webhook.sh [base_url]
# Default base_url: http://localhost:3000

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
SECRET="${GITHUB_WEBHOOK_SECRET:-changeme}"

PAYLOAD='{
  "action": "opened",
  "issue": {
    "number": 42,
    "title": "TypeError: Cannot read properties of undefined (reading userId)",
    "body": "Users get a 500 when logging in via Google OAuth. Happens in AuthService.validateOAuthToken at line 87.",
    "labels": [{"name": "bug"}, {"name": "auth"}],
    "state": "open",
    "html_url": "https://github.com/acme/my-api/issues/42"
  },
  "repository": {
    "id": 12345678,
    "full_name": "acme/my-api",
    "clone_url": "https://github.com/acme/my-api.git",
    "default_branch": "main"
  },
  "sender": { "login": "testuser" }
}'

# Compute HMAC-SHA256
SIG="sha256=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

echo "→ Sending webhook to $BASE_URL/webhooks/github"
echo "→ Signature: $SIG"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST "$BASE_URL/webhooks/github" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: issues" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$PAYLOAD")

BODY=$(echo "$RESPONSE" | sed -n '1p')
STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)

echo "← HTTP $STATUS: $BODY"

if [ "$STATUS" = "202" ]; then
  echo "✅ Webhook accepted — check app logs for triage progress"
else
  echo "❌ Unexpected status"
fi
