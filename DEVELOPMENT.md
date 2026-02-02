# Development Guide

This guide covers setting up ozen-web for development and deployment.

## Documentation

**📚 Full documentation:** [https://ucpresearch.github.io/ozen-web/](https://ucpresearch.github.io/ozen-web/)

For detailed development documentation, see:

- **[Architecture](https://ucpresearch.github.io/ozen-web/development/architecture.html)** — Technical design and system overview
- **[Development Setup](https://ucpresearch.github.io/ozen-web/development/setup.html)** — Detailed setup instructions
- **[WASM Integration](https://ucpresearch.github.io/ozen-web/development/wasm-integration.html)** — Working with acoustic backends
- **[Contributing Guide](https://ucpresearch.github.io/ozen-web/development/contributing.html)** — How to contribute

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [npm](https://www.npmjs.com/) 9+

## Project Structure

```
ozen-web/
├── src/
│   ├── lib/
│   │   ├── stores/         # Svelte stores (audio, view, analysis, etc.)
│   │   ├── components/     # UI components (Spectrogram, Waveform, etc.)
│   │   ├── wasm/           # WASM integration
│   │   ├── audio/          # Web Audio playback
│   │   ├── textgrid/       # TextGrid parser
│   │   └── touch/          # Touch gesture handling for mobile
│   └── routes/
│       ├── +page.svelte    # Main desktop application
│       └── viewer/         # Mobile viewer route (/viewer)
├── static/
│   ├── wasm/
│   │   └── praatfan/       # Local WASM package (copy from praatfan-core-clean)
│   ├── favicon.png         # App icon (1024x1024 source)
│   ├── favicon-32.png      # Browser tab icon
│   ├── icon-192.png        # PWA icon
│   ├── icon-512.png        # PWA splash icon
│   ├── apple-touch-icon.png # iOS home screen icon
│   └── config.yaml         # Optional configuration
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/ucpresearch/ozen-web.git
cd ozen-web
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up WASM package

The local WASM package provides the acoustic analysis engine. Copy from a praatfan build:

**Option A: Copy from praatfan-core-clean (recommended)**

```bash
mkdir -p static/wasm/praatfan
cp -r ../praatfan-core-clean/rust/pkg/* static/wasm/praatfan/
```

**Option B: Download from GitHub releases**

1. Go to [praatfan-core-clean releases](https://github.com/UCPresearch/praatfan-core-clean/releases)
2. Download the WASM package
3. Extract to `static/wasm/praatfan/`

The `static/wasm/praatfan/` directory should contain:
- `praatfan.js` - JavaScript bindings
- `praatfan_bg.wasm` - WebAssembly binary
- `praatfan.d.ts` - TypeScript definitions

**Note**: The app can also load WASM from remote CDN (praatfan or praatfan-gpl backends), so local WASM is optional if you have internet connectivity.

### 4. Start development server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## Building for Production

### Build the app

```bash
npm run build
```

This creates optimized output in the `build/` directory. The build process:
1. Prerenders all routes (Static Site Generation)
2. Runs a post-build script to enable portable deployment
3. Outputs relative paths so the app works from any subdirectory

### Deploy

The `build/` directory contains everything needed for deployment. The app uses relative paths and automatically detects its base URL at runtime, so it can be deployed to any location:

```bash
# Deploy to server root
cp -r build/* /var/www/html/

# Deploy to subdirectory
cp -r build/* /var/www/html/tools/ozen/

# Deploy to S3/CDN subdirectory
aws s3 sync build/ s3://my-bucket/resources/ozen/
```

Example deployment structure (at root or any subdirectory):
```
your-path/
├── index.html
├── _app/              # SvelteKit assets (JS, CSS)
├── pkg/               # WASM package
│   ├── praat_core_wasm.js
│   └── praat_core_wasm_bg.wasm
└── config.yaml        # Optional custom config
```

The app can be served from any static file host (Nginx, Apache, S3, Netlify, Vercel, GitHub Pages, etc.) at any URL path.

## Configuration

The app loads `config.yaml` from the same directory on startup. This file is optional - defaults are used if not present.

See `static/config.yaml` for all available options:
- Color schemes for all visual elements
- Formant presets (male/female/child voice settings)
- Spectrogram display parameters
- Pitch display range
- Default annotation tier names

Users can also load a custom config file at runtime via the settings button.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production (includes post-processing) |
| `npm run preview` | Preview production build |
| `npm run check` | Run Svelte type checking |
| `npm run lint` | Run ESLint |

### Build Process Details

The `npm run build` command:
1. Runs `vite build` to prerender routes
2. Runs `scripts/fix-relative-paths.js` to enable portable deployment

The post-build script converts paths for runtime base detection, allowing the app to work from any URL path without rebuild.

## Architecture Notes

### State Management

All shared state is managed through Svelte stores in `src/lib/stores/`:
- `audio.ts` - Loaded audio buffer and metadata
- `view.ts` - Viewport state (time range, cursor, selection)
- `analysis.ts` - Computed acoustic features
- `annotations.ts` - Annotation tiers and intervals
- `dataPoints.ts` - Data collection points with acoustic values
- `undoManager.ts` - Unified undo/redo for annotations and data points
- `config.ts` - Application configuration

### Unified Undo System

The undo system (`undoManager.ts`) provides a single chronological stack for all undoable operations:

**Undoable operations:**
- Adding/removing annotation boundaries
- Moving annotation boundaries
- Editing interval text labels
- Adding/removing/moving data points

**Non-undoable operations (by design):**
- Adding/removing/renaming tiers
- Loading audio or TextGrid files

**Usage pattern:**
```typescript
import { saveUndo } from '$lib/stores/undoManager';

// In store functions that modify state:
export function myMutation() {
    saveUndo();  // Save state BEFORE the change
    tiers.update(t => { ... });
}
```

**Initialization:**
```typescript
// In +page.svelte onMount:
import { initUndoManager } from '$lib/stores/undoManager';
initUndoManager(tiers, dataPoints);
```

### Data Points

Data points allow collecting acoustic measurements at specific spectrogram locations:

- **Add point:** Double-click on spectrogram (outside existing points)
- **Move point:** Drag an existing point
- **Remove point:** Right-click on a point
- **Export:** Export to TSV with all acoustic values and annotation labels
- **Import:** Import TSV with time/frequency columns

Acoustic values collected at each point:
- Pitch (F0), Intensity, HNR
- Formants (F1-F4) and bandwidths (B1-B4)
- Center of gravity (CoG), Spectral tilt
- A1-P0 (harmonics-to-noise measure)

### WASM Integration

The praatfan library provides Praat-accurate acoustic analysis:
- Pitch extraction (autocorrelation method)
- Formant tracking (Burg's method)
- Intensity calculation
- Harmonicity (HNR)
- Spectrogram computation
- Spectral measures (CoG, spectral tilt)

WASM objects must be manually freed after use to prevent memory leaks.

### Analysis Backends

The app supports multiple analysis backends (`src/lib/wasm/acoustic.ts`):

| Backend | Source | License | Notes |
|---------|--------|---------|-------|
| `praatfan-local` | `static/wasm/praatfan/` | MIT/Apache-2.0 | Default, bundled with app |
| `praatfan` | GitHub Pages CDN | MIT/Apache-2.0 | Clean-room Rust implementation |
| `praatfan-gpl` | GitHub Pages CDN | GPL | Full Praat algorithm reimplementation |

**Backend abstraction layer** (`src/lib/wasm/acoustic.ts`):

The abstraction layer handles API differences between backends:
- `computePitch()`, `computeFormant()`, `computeIntensity()`, etc.
- `getSpectrogramInfo()` - extracts spectrogram metadata uniformly
- `getPitchTimes()`, `getPitchValues()` - handles different return types

Always use these wrapper functions instead of calling WASM methods directly to ensure cross-backend compatibility.

**Adding a new backend:**
1. Add URL to `REMOTE_BACKEND_URLS` or path to `LOCAL_BACKEND_PATHS`
2. Update `AcousticBackend` type in `src/lib/stores/config.ts`
3. Add any API differences to the abstraction layer functions

### Long Audio Optimization

For audio files >60 seconds (`MAX_ANALYSIS_DURATION` in `analysis.ts`), the app defers analysis:

**On file load:**
1. Audio buffer loads normally
2. `runAnalysis()` checks duration and returns early if >60s
3. Spectrogram displays "Zoom in for spectrogram" message

**When user zooms in:**
1. Spectrogram component detects visible window ≤60s
2. Calls `runAnalysisForRange(start, end)` with debounce (300ms)
3. Extracts audio slice, runs full analysis on that region
4. Updates `analysisResults` store with range-specific data

This approach:
- Prevents UI freezing on large files
- Allows working with arbitrarily long recordings
- Computes high-resolution spectrograms for zoomed regions

### Canvas Rendering

Visualizations use layered HTML5 Canvas:
1. Base layer: Spectrogram/waveform image (cached)
2. Overlay layer: Pitch, formants, intensity tracks
3. Selection layer: Time selection highlight
4. Cursor layer: Playback position (animated)

**Spectrogram Zoom Enhancement:**
When zoomed in >2x, the spectrogram automatically regenerates at higher resolution for the visible region (debounced 300ms after zoom stops). This prevents pixelation when examining detailed spectral features.

### Mobile Viewer (`/viewer`)

A touch-optimized view-only mode for phones and tablets at `/viewer`:

- **Touch gestures** (`src/lib/touch/gestures.ts`):
  - Tap: position cursor
  - Single-finger drag: select region
  - Two-finger drag: pan view
  - Pinch: zoom in/out
- **Layout**: Full viewport with safe area insets for notched phones
- **Values bar**: Compact two-row display of acoustic measurements
- **Settings drawer**: Slide-in panel for overlay toggles
- **No editing**: Annotations and data points are view-only

The viewer reuses existing components (Waveform, Spectrogram, TimeAxis) and stores, only adding touch gesture handling and mobile-optimized layout.

## Troubleshooting

### WASM module not loading

- Ensure `static/pkg/` contains the WASM files
- Check browser console for CORS errors (some browsers block local file:// access)
- Try running with `npm run dev` instead of opening HTML directly

### Analysis fails or crashes

- Check browser console for specific error messages
- Ensure audio file is valid (try a simple WAV file first)
- Very long files may exceed browser memory limits

### TextGrid import issues

- Ensure the file is UTF-8 encoded
- Both short and long TextGrid formats are supported
- Check console for parsing error details
