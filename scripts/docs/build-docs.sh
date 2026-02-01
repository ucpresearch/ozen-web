#!/bin/bash
# Build documentation site with screenshots

set -e

echo "📚 Building ozen-web documentation..."
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

# Step 1: Build the main app
echo "1️⃣  Building ozen-web app..."
npm run build

# Step 2: Install screenshot dependencies
echo ""
echo "2️⃣  Installing screenshot dependencies..."
cd scripts/screenshots
if [ ! -d "node_modules" ]; then
    npm install
    npx playwright install chromium
fi
cd ../..

# Step 3: Start preview server and capture screenshots
echo ""
echo "3️⃣  Starting preview server and capturing screenshots..."
npm run preview &
PREVIEW_PID=$!

# Wait for server to be ready
echo "   Waiting for server..."
npx wait-on http://localhost:4173 --timeout 60000 || {
    echo "❌ Error: Preview server failed to start"
    kill $PREVIEW_PID 2>/dev/null || true
    exit 1
}

# Capture screenshots
cd scripts/screenshots
npm run capture:prod || {
    echo "⚠️  Warning: Screenshot capture had errors (continuing...)"
}
cd ../..

# Stop preview server
kill $PREVIEW_PID 2>/dev/null || true

# Step 4: Render Quarto docs
echo ""
echo "4️⃣  Rendering Quarto documentation..."
cd docs
quarto render
cd ..

echo ""
echo "✅ Documentation build complete!"
echo ""
echo "   Output: docs/_site/"
echo "   To preview: cd docs && quarto preview"
echo ""
