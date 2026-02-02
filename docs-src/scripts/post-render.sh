#!/bin/bash
# Post-render script: sync Quarto output to GitHub Pages docs/ directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_SRC_DIR="$(dirname "$SCRIPT_DIR")"
SITE_DIR="$DOCS_SRC_DIR/_site"
DOCS_DIR="$(dirname "$DOCS_SRC_DIR")/docs"

echo "Syncing Quarto output to GitHub Pages directory..."
echo "  Source: $SITE_DIR"
echo "  Target: $DOCS_DIR"

# Remove old docs/ content (except .git, live/, and .nojekyll if they exist)
if [ -d "$DOCS_DIR" ]; then
  find "$DOCS_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name 'live' ! -name '.nojekyll' -exec rm -rf {} +
fi

# Copy _site/ contents to docs/
mkdir -p "$DOCS_DIR"
cp -r "$SITE_DIR"/* "$DOCS_DIR/"

# If live/ exists in docs-src, ensure it's in docs/ (in case it was deleted)
if [ -d "$DOCS_SRC_DIR/live" ] && [ ! -d "$DOCS_DIR/live" ]; then
  echo "Copying live/ directory..."
  cp -r "$DOCS_SRC_DIR/live" "$DOCS_DIR/"
fi

# If .nojekyll exists in docs-src, ensure it's in docs/ (required for GitHub Pages)
if [ -f "$DOCS_SRC_DIR/.nojekyll" ] && [ ! -f "$DOCS_DIR/.nojekyll" ]; then
  echo "Copying .nojekyll file..."
  cp "$DOCS_SRC_DIR/.nojekyll" "$DOCS_DIR/"
fi

echo "✓ Sync complete"
