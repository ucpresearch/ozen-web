#!/bin/bash
# Generate screenshots locally for documentation

set -e

echo "📸 Setting up screenshot capture..."
echo ""

# Check if in correct directory
if [ ! -f "../../package.json" ]; then
    echo "❌ Error: Run this script from scripts/screenshots/ directory"
    exit 1
fi

# Install dependencies
echo "1️⃣  Installing dependencies..."
npm install

# Install Playwright browsers
echo "2️⃣  Installing Playwright browsers (this may take a few minutes)..."
npx playwright install chromium

# Check if preview server is running
if ! curl -s http://localhost:4173 > /dev/null 2>&1; then
    echo ""
    echo "⚠️  Preview server not running!"
    echo ""
    echo "Please start the preview server in another terminal:"
    echo "  cd ../../"
    echo "  npm run preview"
    echo ""
    echo "Then run this script again."
    exit 1
fi

# Capture screenshots
echo ""
echo "3️⃣  Capturing screenshots..."
npm run capture:prod

echo ""
echo "✅ Screenshots captured successfully!"
echo "   Location: ../../docs/screenshots/"
echo ""
ls -lh ../../docs/screenshots/*.png 2>/dev/null | wc -l | xargs echo "   Total screenshots:"
echo ""
echo "You can now run: cd ../../docs && quarto preview"
