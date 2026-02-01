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

# Remove old docs/ content (except .git if it exists)
if [ -d "$DOCS_DIR" ]; then
  find "$DOCS_DIR" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
fi

# Copy _site/ contents to docs/
mkdir -p "$DOCS_DIR"
cp -r "$SITE_DIR"/* "$DOCS_DIR/"

echo "✓ Sync complete"
