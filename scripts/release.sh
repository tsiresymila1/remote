#!/usr/bin/env bash
# Create (or force-recreate) a release tag and push it — retriggers the Release CI.
# Usage:
#   ./scripts/tag.sh            # tag = v<version from mobile/app.json>
#   ./scripts/tag.sh v1.2.3     # explicit tag
set -euo pipefail

cd "$(dirname "$0")/.."

TAG="v${1:-v$(node -p "require('./mobile/app.json').expo.version")}"
[[ "$TAG" == v* ]] || { echo "Tag must start with 'v' (got: $TAG)"; exit 1; }

echo "→ Tag: $TAG"

# Delete previous incarnation everywhere (ignore 'not found' errors).
git tag -d "$TAG" 2>/dev/null && echo "  deleted local tag" || true
git push origin ":refs/tags/$TAG" 2>/dev/null && echo "  deleted remote tag" || true
if command -v gh >/dev/null 2>&1; then
  gh release delete "$TAG" --yes 2>/dev/null && echo "  deleted GitHub release" || true
fi

# Recreate on current HEAD and push.
git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"

echo "✓ $TAG pushed — Release workflow triggered."
command -v gh >/dev/null 2>&1 && gh run watch --exit-status || true
