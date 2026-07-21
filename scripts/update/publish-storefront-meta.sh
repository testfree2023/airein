#!/usr/bin/env bash
# Publish GitHub storefront metadata (topics / homepage) + optional v* Release.
# Requires: gh auth login (valid token with repo admin for topics).
set -euo pipefail

REPO="${REPO:-testfree2023/airein}"
HOMEPAGE="${HOMEPAGE:-https://github.com/testfree2023/airein#readme}"
VERSION_FILE="$(cd "$(dirname "$0")/../.." && pwd)/VERSION"
VERSION="$(tr -d '[:space:]' < "$VERSION_FILE")"
TAG="v${VERSION}"

echo "==> Setting topics + homepage on ${REPO}"
gh api -X PUT "repos/${REPO}/topics" \
  -H "Accept: application/vnd.github+json" \
  --input - <<'EOF'
{
  "names": [
    "claude-code",
    "agent-skills",
    "cursor",
    "hooks",
    "spec-driven",
    "tdd",
    "ai-coding",
    "claude",
    "developer-tools"
  ]
}
EOF

gh api -X PATCH "repos/${REPO}" \
  -H "Accept: application/vnd.github+json" \
  -f homepage="$HOMEPAGE" \
  -f description="Light as air, firm as law. Spec-driven AI coding with hooks."

echo "==> Topics/homepage done."

if [[ "${CREATE_RELEASE:-0}" == "1" ]]; then
  echo "==> Creating GitHub Release ${TAG} (from current HEAD; tag must exist or --generate-notes)"
  if ! git rev-parse "$TAG" >/dev/null 2>&1; then
    git tag -a "$TAG" -m "Release ${TAG}"
    echo "Created local tag ${TAG}; push with: git push origin ${TAG}"
  fi
  if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
    echo "Release ${TAG} already exists."
  else
    NOTES_FILE="$(mktemp)"
    {
      echo "## Airein ${TAG}"
      echo
      echo "See [CHANGELOG.md](https://github.com/${REPO}/blob/main/CHANGELOG.md) section for this version."
      echo
      echo "**Install (full product):**"
      echo '```bash'
      echo "git clone https://github.com/${REPO}.git /tmp/airein && \\"
      echo "bash /tmp/airein/airein setup --yes; rm -rf /tmp/airein"
      echo '```'
      echo
      echo "Skills-only installers do **not** install hooks. Details: SUPPORT.md · docs/demo.md · docs/SECURITY.md"
    } > "$NOTES_FILE"
    gh release create "$TAG" --repo "$REPO" --title "Airein ${TAG}" --notes-file "$NOTES_FILE"
    rm -f "$NOTES_FILE"
  fi
fi

echo "Done. Tip: CREATE_RELEASE=1 $0  # also create/push release for ${TAG}"
