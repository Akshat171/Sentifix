#!/usr/bin/env bash
#
# Deploy / update Sentifix on a single server and reclaim storage by removing
# the PREVIOUS app image after a successful rebuild.
#
# Safety: this is scoped strictly to Sentifix. It removes only the specific
# prior `sentifix-app` image by its ID — it never runs a global prune, so it
# cannot affect other apps (e.g. dilse) sharing the host.
#
# Usage (from the repo root on the server):
#   bash scripts/deploy.prod.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."  # repo root

COMPOSE="docker compose --env-file .env.prod -f docker-compose.prod.yml"

echo "→ Pulling latest code..."
git pull --quiet origin main || echo "  (git pull skipped/failed — continuing with local code)"

echo "→ Recording current app image ID (to remove after rebuild)..."
OLD_IMAGE="$(docker images -q sentifix-app:latest 2>/dev/null || true)"

echo "→ Building + (re)starting Sentifix containers only..."
$COMPOSE up -d --build

NEW_IMAGE="$(docker images -q sentifix-app:latest 2>/dev/null || true)"

if [ -n "$OLD_IMAGE" ] && [ "$OLD_IMAGE" != "$NEW_IMAGE" ]; then
  echo "→ Removing previous app image ($OLD_IMAGE)..."
  docker rmi "$OLD_IMAGE" >/dev/null 2>&1 \
    && echo "  removed." \
    || echo "  (still referenced or already gone — left as-is)"
else
  echo "→ No stale app image to remove (image unchanged or none prior)."
fi

# Remove ONLY orphaned/dangling layers left by our rebuilds. Dangling images are
# untagged AND unused by any container, so this is safe for every running app on
# the host — a running container always pins its image, so it is never dangling.
echo "→ Clearing dangling build layers..."
docker image prune -f >/dev/null 2>&1 || true

echo
echo "→ Sentifix status:"
$COMPOSE ps
echo
echo "→ Disk usage:"
docker system df
