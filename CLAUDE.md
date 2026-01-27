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

## Related Projects

- [ozen](../ozen) - Desktop version (Python/PyQt6)
- [praatfan-core-rs](../praatfan-core-rs) - Rust acoustic analysis library with WASM support

## Resources

- [Svelte documentation](https://svelte.dev/docs)
- [SvelteKit documentation](https://kit.svelte.dev/docs)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
