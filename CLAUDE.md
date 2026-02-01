# CLAUDE.md

## Project Overview

**ozen-web** - A web-based acoustic analysis and annotation tool, the browser version of [Ozen](../ozen).

Built with Svelte/SvelteKit, supporting multiple WASM backends for Praat-accurate acoustic analysis.

## Goals

- Feature parity with desktop Ozen
- Runs entirely in browser (no server required)
- Multiple analysis backends (local WASM or remote CDN)
- Works offline after initial load
- Handles long audio files (>60s) without UI freezing

## Tech Stack

- **SvelteKit** - Framework (prerendered static build)
- **TypeScript** - Type safety
- **praatfan** - Acoustic analysis (Pitch, Formants, Intensity, HNR, Spectrogram, etc.)
- **Web Audio API** - Audio playback
- **Canvas API** - Visualization rendering

## Development Environment

```bash
# Install dependencies
npm install

# Copy local WASM package from praatfan-core-clean
mkdir -p static/wasm/praatfan
cp -r ../praatfan-core-clean/rust/pkg/* static/wasm/praatfan/

# Start dev server
npm run dev

# Build for production
npm run build
```

## Build & Deployment

The app uses **prerendering** (Static Site Generation) instead of SPA mode:

- All routes are prerendered at build time
- Uses relative paths for portable deployment to any subdirectory
- A post-build script (`scripts/fix-relative-paths.js`) ensures dynamic base path detection
- No server required - works from any static file host

**Deploy to subdirectory:**
```bash
# Build produces ./build/ folder
npm run build

# Copy to any location, e.g., S3 bucket subdirectory
aws s3 sync build/ s3://bucket/path/to/app/
```

The app will automatically detect its base path at runtime.

## Directory Structure

```
ozen-web/
├── src/
│   ├── lib/
│   │   ├── stores/           # Svelte stores for shared state
│   │   │   ├── audio.ts      # Audio buffer, sample rate, filename
│   │   │   ├── view.ts       # Time range, zoom, cursor, selection
│   │   │   ├── analysis.ts   # Computed acoustic features
│   │   │   ├── annotations.ts # Tiers, intervals, boundaries
│   │   │   ├── dataPoints.ts # Data collection points
│   │   │   ├── undoManager.ts # Unified undo/redo system
│   │   │   └── config.ts     # Application configuration
│   │   ├── wasm/             # praatfan WASM integration
│   │   │   └── acoustic.ts   # Wrapper functions for WASM calls
│   │   ├── audio/            # Web Audio playback
│   │   │   └── player.ts     # Play, pause, seek, selection playback
│   │   ├── textgrid/         # TextGrid parser
│   │   │   └── parser.ts     # Import/export Praat TextGrid
│   │   ├── touch/            # Touch gesture handling
│   │   │   └── gestures.ts   # Pan, zoom, selection for mobile
│   │   ├── components/       # UI components
│   │   │   ├── Waveform.svelte
│   │   │   ├── Spectrogram.svelte
│   │   │   ├── AnnotationEditor.svelte
│   │   │   ├── Tier.svelte
│   │   │   ├── TimeAxis.svelte
│   │   │   ├── ValuesPanel.svelte
│   │   │   ├── Modal.svelte
│   │   │   └── FileDropZone.svelte
│   │   └── types.ts          # TypeScript type definitions
│   ├── routes/
│   │   ├── +page.svelte      # Main application
│   │   ├── +layout.svelte    # App shell
│   │   ├── +layout.ts        # Prerender config
│   │   └── viewer/           # Mobile viewer route
│   │       ├── +page.svelte  # Touch-optimized viewer
│   │       └── +layout.ts    # Prerender config
│   └── app.html
├── static/
│   ├── wasm/
│   │   └── praatfan/         # Local WASM package (MIT/Apache-2.0)
│   ├── favicon.png           # App icon source (1024x1024)
│   ├── favicon-32.png        # Browser tab icon
│   ├── icon-192.png          # PWA icon
│   ├── icon-512.png          # PWA splash icon
│   ├── apple-touch-icon.png  # iOS home screen icon
│   └── config.yaml           # Optional configuration
├── docs/                     # Documentation (Quarto)
│   ├── _quarto.yml           # Quarto configuration
│   ├── index.qmd             # Landing page
│   ├── getting-started.qmd   # Quick start guide
│   ├── tutorial/             # Step-by-step tutorials (7 pages)
│   ├── features/             # Feature documentation (8 pages)
│   ├── embedding/            # Embedding guides (5 pages)
│   ├── reference/            # Technical reference (4 pages)
│   ├── development/          # Developer guides (5 pages)
│   ├── screenshots/          # Generated screenshots
│   └── _site/                # Rendered site (after quarto render)
├── scripts/
│   ├── create-iframe.R       # R embedding helper
│   ├── create-iframe.py      # Python embedding helper
│   ├── fix-relative-paths.js # Build script
│   └── screenshots/          # Playwright screenshot automation
│       ├── package.json
│       ├── playwright.config.ts
│       ├── capture-screenshots.js
│       └── screenshot-config.json
├── package.json
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── CLAUDE.md
├── DEVELOPMENT.md
└── README.md
```

## Architecture

### State Management (Svelte Stores)

All shared state lives in `src/lib/stores/`. Components subscribe to stores and react to changes.

Key stores:
- `audio.ts` - Audio buffer (Float64Array), sample rate, filename
- `view.ts` - Time range, cursor position, selection, hover position
- `analysis.ts` - Computed pitch, formants, intensity, HNR, CoG, spectral tilt
- `annotations.ts` - Annotation tiers with intervals and boundaries
- `dataPoints.ts` - Data collection points with acoustic measurements
- `undoManager.ts` - Unified undo/redo for annotations and data points
- `config.ts` - Application colors, formant presets, display settings

### Unified Undo System

The undo system (`src/lib/stores/undoManager.ts`) provides a single undo/redo stack for both annotation changes and data point operations:

**Architecture:**
- State-snapshot approach: captures entire state (tiers + dataPoints) before each change
- Single stack ensures chronological undo order across all operation types
- Uses JSON deep-copy for state isolation

**Undoable Operations:**
- Adding/removing annotation boundaries
- Moving annotation boundaries
- Editing interval text labels
- Adding/removing/moving data points

**Non-Undoable Operations (by design):**
- Adding/removing/renaming tiers
- Loading audio/TextGrid files

**Usage Pattern:**
```typescript
import { saveUndo } from '$lib/stores/undoManager';

export function someOperation(): void {
    saveUndo();  // Always call BEFORE mutation
    tiers.update(t => { ... });
}
```

### Canvas Rendering Strategy

**Spectrogram:**
1. Compute full spectrogram once via WASM `to_spectrogram()`
2. Apply grayscale colormap → ImageData
3. Cache to off-screen canvas
4. Redraw visible portion on zoom/pan
5. When zoomed >2x, regenerate high-resolution spectrogram for visible region (debounced 300ms)
6. Overlay tracks (pitch, formants, data points) drawn on top

**Waveform:**
1. Downsample for display (min/max per pixel column)
2. Draw as filled path on canvas
3. Redraw on zoom/pan

**Overlays (drawn on spectrogram):**
- Pitch: Blue line with dots
- Formants: Red dots (F1-F4)
- Intensity: Green line
- HNR/CoG/Spectral Tilt: Additional colored tracks
- Data Points: Yellow dashed lines with markers
- Cursor: Red vertical line
- Selection: Semi-transparent blue rectangle

### Data Points

Data points allow collecting acoustic measurements at specific time/frequency locations:

- **Add:** Double-click on spectrogram
- **Remove:** Right-click → Remove
- **Move:** Click and drag
- **Export:** TSV file with time, frequency, all acoustic values, and annotation labels

Each point automatically captures:
- Time and frequency position
- Pitch, Intensity, F1-F4, B1-B4, HNR, CoG, Spectral Tilt, A1-P0
- Text from all annotation tiers at that time

### Analysis Backends

The app supports multiple WASM backends (`src/lib/wasm/acoustic.ts`):

| Backend | Source | License |
|---------|--------|---------|
| `praatfan-local` | `static/wasm/praatfan/` | MIT/Apache-2.0 (default) |
| `praatfan` | GitHub Pages CDN | MIT/Apache-2.0 |
| `praatfan-gpl` | GitHub Pages CDN | GPL |

The abstraction layer in `acoustic.ts` handles API differences between backends. Always use wrapper functions (`computePitch()`, `getSpectrogramInfo()`, etc.) instead of direct WASM calls.

### Long Audio Handling

For files >60 seconds (`MAX_ANALYSIS_DURATION` in `analysis.ts`):

1. **On load**: Waveform displays, spectrogram shows "Zoom in for spectrogram"
2. **When zoomed** to ≤60s visible window: `runAnalysisForRange()` computes analysis for that region
3. **Debounced**: 300ms delay prevents excessive recomputation during zoom/pan

This allows working with arbitrarily long recordings without UI freezing.

## Implemented Features

### Core Viewing
- [x] Load audio file (drag & drop or file picker)
- [x] Microphone recording (MediaRecorder API)
- [x] Save audio as WAV (16-bit PCM)
- [x] Waveform display with amplitude visualization
- [x] Spectrogram display (grayscale, Praat-style)
- [x] Synchronized zoom/scroll (wheel to zoom, horizontal scroll to pan)
- [x] Audio playback (selection or visible window)
- [x] Real-time cursor tracking during playback

### Acoustic Overlays
- [x] Pitch (F0) track with dots
- [x] Intensity track
- [x] Formants (F1-F4)
- [x] Toggle checkboxes for each overlay
- [x] HNR (Harmonics-to-Noise Ratio)
- [x] CoG (Center of Gravity)
- [x] Spectral Tilt
- [x] A1-P0 (nasal measure)

### Annotations
- [x] TextGrid import (short and long formats)
- [x] Tier display with intervals
- [x] Text editing (double-click to edit, Enter to save)
- [x] Add boundaries (double-click on tier)
- [x] Remove boundaries (right-click context menu)
- [x] Move boundaries (drag)
- [x] Boundary snapping to upper tiers
- [x] TextGrid export with native Save dialog (File System Access API)
- [x] Unified undo/redo (Ctrl+Z / Ctrl+Y)

### Data Points
- [x] Add points (double-click on spectrogram)
- [x] Display as vertical dashed lines with markers
- [x] Drag to move
- [x] Right-click to remove
- [x] TSV export with all acoustic values + annotations
- [x] TSV import

### UI/UX
- [x] Keyboard shortcuts (Space, Tab, Escape, 1-5, Ctrl+Z, etc.)
- [x] Configuration via YAML file
- [x] Dark/light theme toggle
- [x] Values panel showing measurements at cursor
- [x] Interval duration display
- [x] Max frequency selector (5/7.5/10 kHz)
- [x] Backend selector (praatfan-local, praatfan, praatfan-gpl)
- [x] Long audio support (>60s files: on-demand analysis when zoomed)
- [x] PWA icons for home screen installation

### Mobile Viewer (`/viewer` route)
- [x] Touch-optimized view-only mode
- [x] Touch gestures: tap (cursor), drag (select), two-finger drag (pan), pinch (zoom)
- [x] Compact two-row values bar (F0, Int, HNR, F1-F4, CoG)
- [x] Settings drawer with overlay toggles
- [x] Floating play button
- [x] Landscape mode optimization
- [x] Safe area support for notched phones
- [x] URL-based audio loading (`?audio=` parameter)
- [x] URL-based overlay configuration (`?overlays=` parameter)
- [x] Iframe embedding support with pre-configuration
- [x] CORS-enabled remote file loading
- [x] Data URL support for self-contained embeds
- [x] Loading state UI with retry and error handling

## Key Differences from Desktop Ozen

| Aspect | Desktop (PyQt6) | Web (Svelte) |
|--------|-----------------|--------------|
| Acoustic analysis | parselmouth | praatfan |
| Audio playback | sounddevice | Web Audio API |
| Rendering | pyqtgraph | Canvas API |
| File access | Direct filesystem | File API (user selects) |
| Save | Direct to disk | Download / File System Access API |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play selection / pause |
| Escape | Stop playback / deselect |
| Tab | Play visible window |
| Scroll wheel | Zoom (centered on cursor) |
| Horizontal scroll | Pan view |
| Double-click (tier) | Add boundary |
| Double-click (spectrogram) | Add data point |
| Right-click (boundary) | Remove boundary menu |
| Right-click (data point) | Remove point menu |
| Ctrl+Z / Cmd+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| 1-5 | Switch annotation tier |

## WASM Integration

Use the abstraction layer in `src/lib/wasm/acoustic.ts` for cross-backend compatibility:

```typescript
import {
  initWasm, wasmReady, getWasm,
  computePitch, computeFormant, computeIntensity, computeSpectrogram,
  getPitchTimes, getPitchValues, getSpectrogramInfo
} from '$lib/wasm/acoustic';

// Initialize WASM with selected backend (default: 'praatfan-local')
await initWasm('praatfan-local');

// Create Sound from samples
const wasm = getWasm();
const sound = new wasm.Sound(samples, sampleRate);

// Compute analyses using abstraction layer
const pitch = computePitch(sound, 0.01, 75, 600);
const formant = computeFormant(sound, 0.01, 5, 5500, 0.025, 50);
const intensity = computeIntensity(sound, 75, 0.01);
const spectrogram = computeSpectrogram(sound, 0.005, 5000, 0.002, 20);

// Get values using abstraction layer
const times = getPitchTimes(pitch);    // Float64Array
const values = getPitchValues(pitch);  // Float64Array
const info = getSpectrogramInfo(spectrogram);  // { nTimes, nFreqs, values, ... }

// IMPORTANT: Free WASM objects when done
sound.free();
pitch.free();
spectrogram.free();
```

**Important:** Always use the abstraction functions (`computePitch`, `getSpectrogramInfo`, etc.) instead of calling WASM methods directly. This ensures compatibility across all backends.

## Embedding in Quarto/R Markdown

The viewer can be embedded in Quarto/R Markdown documents using helper scripts that generate iframe HTML with proper paths and configuration.

### Helper Scripts

**Location:** `scripts/create-iframe.R` and `scripts/create-iframe.py`

Both scripts:
- Calculate correct relative paths from viewer to audio file
- Generate iframe HTML with `data-external="1"` attribute (prevents Quarto from embedding as data URL)
- Support customizable height (pixels or percentages)
- Include all necessary parameters for the viewer

### Usage

**R (in .qmd/.Rmd):**
```r
source("scripts/create-iframe.R")

# Basic usage (default: height=600)
html <- create_embedded_viewer("audio.wav")

# With custom overlays and height
html <- create_embedded_viewer(
  "audio.wav",
  overlays = "pitch,formants,hnr",
  height = 800           # Pixels
)

# Height as percentage
html <- create_embedded_viewer(
  "audio.wav",
  overlays = "pitch,formants",
  height = "80%"         # Percentage
)

# Render in document
htmltools::HTML(html)
```

**Python (in .qmd/.ipynb):**
```python
import sys
sys.path.append('scripts')
from create_iframe import create_embedded_viewer

# Basic usage
html = create_embedded_viewer("audio.wav")

# With custom parameters
html = create_embedded_viewer(
    "audio.wav",
    overlays="pitch,formants,hnr",
    height=800             # Pixels
)

# Height as percentage
html = create_embedded_viewer(
    "audio.wav",
    overlays="pitch,formants",
    height="80%"           # String for percentage
)

print(html)
```

**Command line:**
```bash
# R
Rscript scripts/create-iframe.R audio.wav "pitch,formants" "./ozen-web/viewer.html" 800
Rscript scripts/create-iframe.R audio.wav "pitch,formants" "./ozen-web/viewer.html" "80%"

# Python
python scripts/create-iframe.py audio.wav --overlays pitch,formants --height 800
python scripts/create-iframe.py audio.wav --overlays pitch,formants --height 80%
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `audio_path` | string | required | Path to audio file (relative to current directory) |
| `overlays` | string | `"pitch,formants"` | Comma-separated overlays: `pitch`, `formants`, `intensity`, `hnr`, `cog`, `spectraltilt`, `a1p0`, or `all` |
| `viewer_url` | string | `"./ozen-web/viewer.html"` | Path to viewer.html |
| `height` | int/string | `600` | Iframe height: number (pixels) or string (`"80%"`, `"90vh"`) |

### Critical: Quarto `embed-resources` Setting

**IMPORTANT:** The generated iframes include `data-external="1"` to prevent Quarto from converting them to data URLs when `embed-resources: true` is set.

**Why this matters:**
- Quarto's `embed-resources: true` normally embeds iframe sources as data URLs
- ES6 module imports (used by the viewer) **cannot resolve in data URL contexts** (browser limitation)
- Without `data-external="1"`, you'll see errors like:
  ```
  <link rel=modulepreload> has no `href` value
  Failed to resolve module specifier './_app/immutable/entry/start.js'
  ```

**The scripts automatically include this attribute**, so iframes work correctly regardless of Quarto's embed-resources setting.

### Serving Quarto Documents

Browsers block `file://` URLs from loading iframes. You **must** serve documents over HTTP:

**Python:**
```bash
python scripts/serve-quarto.py [directory] [port]
# Or: python -m http.server 8000
```

**R:**
```r
source("scripts/serve-quarto.R")
serve_quarto()  # Serves on http://localhost:8000
```

Then open `http://localhost:8000/your-document.html`

### Example Output

The scripts generate HTML like:
```html
<iframe
  data-external="1"
  src="./ozen-web/viewer.html?audio=../audio.wav&overlays=pitch,formants"
  width="100%"
  height="600"
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>
```

## Documentation

### Overview

ozen-web includes comprehensive documentation built with **Quarto**, totaling **~36,000 words across 31 pages**. The documentation covers everything from beginner tutorials to advanced developer guides.

**Location:** `docs/` directory

**Rendered site:** `docs/_site/` (after building)

**Live site:** https://ucpresearch.github.io/ozen-web/ (when deployed to GitHub Pages)

### Documentation Structure

```
docs/
├── index.qmd                    # Landing page (587 words)
├── getting-started.qmd          # Quick start guide (968 words)
├── tutorial/                    # Step-by-step tutorials (7,256 words)
│   ├── index.qmd
│   ├── 01-loading-audio.qmd
│   ├── 02-exploring-audio.qmd
│   ├── 03-acoustic-analysis.qmd
│   ├── 04-annotations.qmd
│   ├── 05-data-collection.qmd
│   └── 06-exporting.qmd
├── features/                    # Feature documentation (8,208 words)
│   ├── overview.qmd
│   ├── spectrogram.qmd
│   ├── acoustic-overlays.qmd
│   ├── annotations.qmd
│   ├── data-points.qmd
│   ├── waveform.qmd
│   ├── audio-playback.qmd
│   └── mobile-viewer.qmd
├── embedding/                   # Embedding guides (4,984 words)
│   ├── overview.qmd
│   ├── basic-usage.qmd
│   ├── url-parameters.qmd
│   ├── quarto-integration.qmd
│   └── examples.qmd
├── reference/                   # Technical reference (4,496 words)
│   ├── keyboard-shortcuts.qmd
│   ├── configuration.qmd
│   ├── backends.qmd
│   └── file-formats.qmd
├── development/                 # Developer guides (9,872 words)
│   ├── setup.qmd
│   ├── architecture.qmd
│   ├── stores.qmd
│   ├── wasm-integration.qmd
│   └── contributing.qmd
├── screenshots/                 # Generated screenshots (20 images)
├── _quarto.yml                  # Quarto configuration
└── assets/
    └── styles.css               # Custom CSS
```

### Content Breakdown

| Section | Pages | Words | Description |
|---------|-------|-------|-------------|
| **Landing & Getting Started** | 2 | 1,555 | Project overview and quick start |
| **Tutorial** | 7 | 7,256 | Complete beginner workflow |
| **Features** | 8 | 8,208 | Detailed feature documentation |
| **Embedding** | 5 | 4,984 | Integration guides with examples |
| **Reference** | 4 | 4,496 | Technical specifications |
| **Development** | 5 | 9,872 | Comprehensive developer guide |
| **TOTAL** | **31** | **36,371** | Complete documentation |

### Building the Documentation

**Prerequisites:**
- Quarto 1.4.549 or later
- Pandoc (included with Quarto)

**Build commands:**

```bash
# Preview locally (with hot reload)
cd docs
quarto preview

# Render to HTML (output: docs/_site/)
cd docs
quarto render

# Check output
ls -la _site/
```

**Accessing the rendered site:**
```bash
# After rendering, open in browser:
open _site/index.html  # macOS
xdg-open _site/index.html  # Linux
start _site/index.html  # Windows

# Or serve with HTTP server (required for some features):
cd _site
python -m http.server 8000
# Visit http://localhost:8000
```

### Screenshot Automation

The documentation includes automated screenshot capture using **Playwright**:

**Location:** `scripts/screenshots/`

**Generates:** 20 screenshots covering all major features

**Usage:**
```bash
# Start dev server (terminal 1)
npm run dev

# Capture screenshots (terminal 2)
cd scripts/screenshots
npm install  # First time only
npm run capture:dev

# Output: docs/screenshots/*.png
```

**Screenshot scenarios:**
- Main interface overview
- Spectrogram with overlays
- Annotation editing
- Data point collection
- Mobile viewer
- Settings panels
- Tutorial step-by-step visuals

### Deployment to GitHub Pages

**Automated deployment** via GitHub Actions (see `.github/workflows/deploy-docs.yml`):

```yaml
# On push to master (docs/** changes)
- Build ozen-web app
- Start preview server
- Capture screenshots
- Render Quarto docs
- Deploy to gh-pages branch
```

**Manual deployment:**
```bash
# From docs/ directory
quarto publish gh-pages

# Or via GitHub Actions
git push origin master  # Triggers workflow
```

**Live site:** Once deployed, documentation is available at:
```
https://USERNAME.github.io/ozen-web/
```

### Documentation Features

**Navigation:**
- Top navbar with main sections
- Context-aware sidebar
- Breadcrumbs
- Previous/Next links in tutorial
- Full-text search

**Content:**
- Mermaid diagrams for architecture
- Syntax-highlighted code blocks
- Copy buttons on code blocks
- Tables for reference data
- Callout boxes for warnings/notes
- Cross-references between pages

**Responsive:**
- Mobile-friendly layout
- Adaptive navigation
- Touch-friendly controls

### Key Documentation Pages

**For users:**
- [Getting Started](docs/getting-started.qmd) - Installation and first steps
- [Tutorial](docs/tutorial/) - Complete workflow from loading to exporting
- [Features](docs/features/) - All features with screenshots
- [Keyboard Shortcuts](docs/reference/keyboard-shortcuts.qmd) - Quick reference

**For embedding:**
- [Basic Usage](docs/embedding/basic-usage.qmd) - iframe embedding guide
- [URL Parameters](docs/embedding/url-parameters.qmd) - Complete parameter reference
- [Quarto Integration](docs/embedding/quarto-integration.qmd) - R/Python helper scripts
- [Examples](docs/embedding/examples.qmd) - 10 real-world copy-paste examples

**For developers:**
- [Setup](docs/development/setup.qmd) - Development environment
- [Architecture](docs/development/architecture.qmd) - System design (2,410 words)
- [Stores](docs/development/stores.qmd) - State management guide (2,529 words)
- [WASM Integration](docs/development/wasm-integration.qmd) - Backend development (2,122 words)
- [Contributing](docs/development/contributing.qmd) - Contribution workflow (2,090 words)

### Maintenance

**Updating documentation:**
```bash
# Edit .qmd files in docs/
vim docs/tutorial/01-loading-audio.qmd

# Preview changes live
cd docs
quarto preview  # Auto-reloads on save

# Commit and push
git add docs/
git commit -m "docs: Update loading audio tutorial"
git push
```

**Regenerating screenshots:**
```bash
# Update screenshot scenarios in scripts/screenshots/screenshot-config.json
# Then recapture:
npm run dev  # Terminal 1
cd scripts/screenshots && npm run capture:dev  # Terminal 2
```

**Weekly automated updates:**
- Screenshots refreshed via GitHub Actions (Mondays 2am UTC)
- Ensures screenshots stay current with UI changes

## Related Projects

- [ozen](../ozen) - Desktop version (Python/PyQt6)
- [praatfan-core-rs](../praatfan-core-rs) - Rust acoustic analysis library with WASM support

## Resources

- [Svelte documentation](https://svelte.dev/docs)
- [SvelteKit documentation](https://kit.svelte.dev/docs)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Quarto documentation](https://quarto.org/docs/guide/) - Documentation framework
