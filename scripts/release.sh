#!/usr/bin/env bash
set -euo pipefail

CURRENT=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT"
echo ""

bump_version() {
  local current="$1" part="$2"
  IFS='.' read -r major minor patch <<< "$current"
  case "$part" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "${major}.$((minor + 1)).0" ;;
    patch) echo "${major}.${minor}.$((patch + 1))" ;;
  esac
}

PATCH=$(bump_version "$CURRENT" "patch")
MINOR=$(bump_version "$CURRENT" "minor")
MAJOR=$(bump_version "$CURRENT" "major")

echo "Select release type:"
echo ""
echo "  1) patch  → $PATCH"
echo "  2) minor  → $MINOR"
echo "  3) major  → $MAJOR"
echo "  4) custom"
echo ""
read -rp "Choice [1-4]: " CHOICE

case "$CHOICE" in
  1) NEW_VERSION="$PATCH" ;;
  2) NEW_VERSION="$MINOR" ;;
  3) NEW_VERSION="$MAJOR" ;;
  4)
    read -rp "Enter version (e.g. 1.2.3): " NEW_VERSION
    if [[ ! "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "Error: invalid semver format"
      exit 1
    fi
    ;;
  *)
    echo "Error: invalid choice"
    exit 1
    ;;
esac

echo ""
echo "  $CURRENT → $NEW_VERSION"
echo ""
read -rp "Confirm? [y/N]: " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

# Update package.json version
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '${NEW_VERSION}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Commit and tag
git add package.json
git commit -m "release: v${NEW_VERSION}"
git tag "v${NEW_VERSION}"

echo ""
echo "✅ v${NEW_VERSION} tagged locally"
echo ""
echo "Run this to publish:"
echo "  git push origin main --tags"
