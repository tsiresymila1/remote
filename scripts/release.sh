#!/usr/bin/env bash
# Create (or force-recreate) a release tag and push it — retriggers the Release CI.
# Usage:
#   ./scripts/release.sh            # tag = v<version from mobile/app.json>
#   ./scripts/release.sh v1.2.3     # explicit tag
set -euo pipefail

cd "$(dirname "$0")/.."

TAG="${1:-v$(node -p "require('./mobile/app.json').expo.version")}"
# Tauri requires strict x.y.z semver — reject anything else before CI does.
[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Tag must be full semver like v1.2.3 (got: $TAG)"; exit 1; }

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
