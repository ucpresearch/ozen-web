# ozen-web Documentation

This directory contains the Quarto-based documentation site for ozen-web.

## Quick Start

### Prerequisites

1. **Quarto** (1.4.549 or later)
   - Download from: https://quarto.org/docs/get-started/
   - Or install via package manager:
     ```bash
     # macOS
     brew install quarto

     # Windows (via Chocolatey)
     choco install quarto

     # Linux (via apt)
     sudo apt install quarto
     ```

2. **Node.js** 18+ (for screenshot automation)
   - Already required for main ozen-web project

### Building Documentation

```bash
# From ozen-web root directory
./scripts/docs/build-docs.sh
```

This script will:
1. Build the ozen-web app
2. Install screenshot dependencies (Playwright)
3. Start preview server and capture screenshots
4. Render Quarto documentation
5. Output to `docs/_site/`

### Previewing Documentation

```bash
# From ozen-web root directory
./scripts/docs/serve-docs.sh
```

Or manually:

```bash
cd docs
quarto preview
```

Opens a live preview server at http://localhost:8080 with auto-reload.

### Manual Screenshot Capture

If you want to update screenshots without rebuilding everything:

```bash
# Start ozen-web preview server (Terminal 1)
npm run build
npm run preview

# Capture screenshots (Terminal 2)
cd scripts/screenshots
npm install  # First time only
npm run capture:prod
```

Screenshots are saved to `docs/screenshots/`.

## Directory Structure

```
docs/
├── _quarto.yml               # Main Quarto configuration
├── index.html                 # Landing page
├── getting-started.html       # Quick start guide
├── tutorial/                 # Step-by-step tutorial (7 pages)
│   ├── index.html
│   ├── 01-loading-audio.html
│   ├── 02-exploring-audio.html
│   ├── 03-acoustic-analysis.html
│   ├── 04-annotations.html
│   ├── 05-data-collection.html
│   └── 06-exporting.html
├── features/                 # Feature documentation (8 pages)
│   ├── overview.html
│   ├── spectrogram.html
│   ├── waveform.html
│   ├── annotations.html
│   ├── acoustic-overlays.html
│   ├── data-points.html
│   ├── audio-playback.html
│   └── mobile-viewer.html
├── embedding/                # Embedding guide (5 pages)
│   ├── overview.html
│   ├── basic-usage.html
│   ├── quarto-integration.html
│   ├── url-parameters.html
│   └── examples.html
├── reference/                # Reference docs (4 pages)
│   ├── keyboard-shortcuts.html
│   ├── configuration.html
│   ├── backends.html
│   └── file-formats.html
├── development/              # Developer docs (5 pages)
│   ├── setup.html
│   ├── architecture.html
│   ├── stores.html
│   ├── wasm-integration.html
│   └── contributing.html
├── screenshots/              # Auto-generated screenshots
├── assets/                   # CSS and static assets
│   └── styles.css
├── examples/                 # Sample audio files
└── _site/                    # Generated output (git-ignored)
```

## Writing Documentation

### Creating New Pages

1. Create a `.html` file in the appropriate directory
2. Add YAML front matter:
   ```yaml
   ---
   title: "Page Title"
   subtitle: "Optional subtitle"
   ---
   ```
3. Write content in Markdown with Quarto extensions
4. Add to `_quarto.yml` navigation if needed

### Using Custom Styles

Custom CSS classes are available in `assets/styles.css`:

```markdown
::: {.callout-tip}
This is a tip callout box.
:::

::: {.callout-warning}
This is a warning.
:::

::: {.feature-grid}
Grid of feature cards...
:::

::: {.screenshot}
![Alt text](path/to/image.png)
:::
```

### Adding Screenshots

1. Define screenshot scenario in `scripts/screenshots/screenshot-config.json`
2. Run screenshot capture (see above)
3. Reference in documentation:
   ```markdown
   ![Description](../screenshots/your-screenshot.png){.screenshot}
   ```

### Code Blocks

````markdown
```bash
# Bash commands
npm install
```

```javascript
// JavaScript code
const foo = 'bar';
```

```python
# Python code
import pandas as pd
```
````

### Keyboard Shortcuts

Use `<kbd>` tags for keyboard shortcuts:

```markdown
Press <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo.
```

## Deployment

### GitHub Pages (Automatic)

Documentation deploys automatically via GitHub Actions:

- **Trigger:** Push to `master` branch (changes in `docs/`)
- **Workflow:** `.github/workflows/deploy-docs.yml`
- **URL:** `https://ucpresearch.github.io/ozen-web/`

### Manual Deployment

```bash
# Build docs
./scripts/docs/build-docs.sh

# Deploy _site/ folder to any static host:
# - GitHub Pages (gh-pages branch)
# - Netlify (drag & drop or CLI)
# - Vercel (vercel --prod docs/_site)
# - AWS S3, etc.
```

## Screenshot Automation

### Configuration

Edit `scripts/screenshots/screenshot-config.json` to define screenshots:

```json
{
  "screenshots": [
    {
      "name": "feature-demo",
      "route": "/",
      "viewport": {"width": 1280, "height": 720},
      "actions": [
        {"type": "loadAudio", "file": "test-audio/sample.wav"},
        {"type": "wait", "ms": 2000},
        {"type": "toggleOverlay", "overlay": "pitch"}
      ],
      "description": "Feature demonstration"
    }
  ]
}
```

### Action Types

- `wait` — Pause for specified milliseconds
- `loadAudio` — Load audio file
- `toggleOverlay` — Enable/disable acoustic overlay
- `click` — Click at position
- `dragSelect` — Select time region
- `addTier` — Create annotation tier
- `addDataPoint` — Add measurement point

### Test Audio

Place sample audio files in `scripts/screenshots/test-audio/`:

- Format: WAV (16-bit PCM)
- Duration: 5-15 seconds recommended
- Content: Speech with clear vowels and consonants

See `scripts/screenshots/test-audio/README.md` for details.

## Updating Documentation

### Weekly Screenshot Refresh

Screenshots update automatically via GitHub Actions:

- **Schedule:** Every Monday at 2am UTC
- **Workflow:** `.github/workflows/update-screenshots.yml`
- **Action:** Captures fresh screenshots and commits changes

### Content Updates

1. Edit `.html` files locally
2. Preview changes: `quarto preview`
3. Commit and push to trigger auto-deployment

### Stub Files

Some pages are stubs marked with "TODO". To complete them:

1. Open the stub file (e.g., `features/spectrogram.html`)
2. Replace TODO section with actual content
3. Follow existing page structure for consistency
4. Add screenshots if applicable
5. Update cross-references and navigation

## Troubleshooting

### Quarto not found

```bash
# Install Quarto
brew install quarto  # macOS
# or download from https://quarto.org
```

### Screenshot capture fails

```bash
# Check ozen-web preview server is running
npm run preview

# Ensure Playwright browsers are installed
cd scripts/screenshots
npx playwright install chromium

# Check screenshot config syntax
cat screenshot-config.json | jq .  # Requires jq
```

### Documentation doesn't build

```bash
# Check for YAML syntax errors
cd docs
quarto check

# Clear cache and rebuild
rm -rf _site .quarto
quarto render
```

### Screenshots are blank/wrong

- Increase wait times in action sequences
- Check test audio files exist
- Verify selectors in screenshot-config.json
- Run with `PWDEBUG=1` to see browser actions:
  ```bash
  cd scripts/screenshots
  PWDEBUG=1 node capture-screenshots.js
  ```

## Resources

- **Quarto Documentation:** https://quarto.org/docs/
- **Playwright Documentation:** https://playwright.dev/
- **GitHub Pages Setup:** https://docs.github.com/en/pages
- **Markdown Guide:** https://www.markdownguide.org/

## Contributing

See [Contributing Guide](development/contributing.html) for documentation contribution guidelines.

When writing documentation:

- Use clear, concise language
- Include code examples
- Add screenshots for visual features
- Cross-reference related pages
- Test all code snippets
- Follow existing page structure

---

**Questions or issues?** Open an issue at [GitHub Issues](https://github.com/ucpresearch/ozen-web/issues)
