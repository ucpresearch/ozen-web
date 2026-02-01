#!/bin/bash
# Serve documentation site locally for development

set -e

echo "🌐 Starting documentation preview server..."
echo ""

# Check if Quarto is installed
if ! command -v quarto &> /dev/null; then
    echo "❌ Error: Quarto is not installed"
    echo "   Install from: https://quarto.org/docs/get-started/"
    exit 1
fi

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this script from the ozen-web root directory"
    exit 1
fi

# Check if docs exist
if [ ! -d "docs/_site" ]; then
    echo "📚 Documentation not built yet. Building now..."
    ./scripts/docs/build-docs.sh
fi

echo "📖 Preview documentation at: http://localhost:8080"
echo "   (Press Ctrl+C to stop)"
echo ""

cd docs
quarto preview --port 8080 --no-browser
