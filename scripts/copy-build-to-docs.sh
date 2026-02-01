#!/bin/bash
# Copy build/ directory to docs/live/ for embedded examples

set -e  # Exit on error

echo "Copying build/ to docs/live/..."

# Remove old live directory if it exists
if [ -d "docs/live" ]; then
    rm -rf docs/live
fi

# Check if build directory exists
if [ ! -d "build" ]; then
    echo "Error: build/ directory not found. Run 'npm run build' first."
    exit 1
fi

# Copy build to docs/live
cp -r build docs/live

echo "✓ Copied build/ to docs/live/ ($(du -sh docs/live | cut -f1))"
