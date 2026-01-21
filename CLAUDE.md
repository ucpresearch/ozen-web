# CLAUDE.md

## Project Overview

**ozen-web** - A web-based acoustic analysis and annotation tool, the browser version of [Ozen](../ozen).

Built with Svelte/SvelteKit, using [praatfan-core-wasm](../praatfan-core-rs) for Praat-accurate acoustic analysis.

## Goals

- Feature parity with desktop Ozen
- Runs entirely in browser (no server required)
- Uses praatfan-core-wasm for all acoustic analysis
- Works offline after initial load

## Tech Stack

- **SvelteKit** - Framework
- **TypeScript** - Type safety
- **praatfan-core-wasm** - Acoustic analysis (Pitch, Formants, Intensity, HNR, Spectrogram, etc.)
- **Web Audio API** - Audio playback
- **Canvas API** - Visualization rendering

## Development Environment

```bash
# Install dependencies
npm install

# Copy WASM package from praatfan-core-rs
cp -r ../praatfan-core-rs/wasm/pkg static/pkg

# Start dev server
npm run dev

# Build for production
npm run build
```

## Directory Structure

```
ozen-web/
├── src/
│   ├── lib/
│   │   ├── stores/         # Svelte stores for shared state
│   │   │   ├── audio.ts    # Audio buffer, sample rate
│   │   │   ├── view.ts     # Time range, zoom, cursor position
│   │   │   ├── selection.ts # Selection state
│   │   │   ├── analysis.ts # Computed acoustic features
│   │   │   └── annotations.ts # Tiers, intervals, boundaries
│   │   ├── wasm/           # praatfan-core-wasm integration
│   │   │   └── acoustic.ts # Wrapper functions for WASM calls
│   │   ├── audio/          # Web Audio playback
│   │   │   └── player.ts   # Play, pause, seek, selection playback
│   │   ├── textgrid/       # TextGrid parser
│   │   │   └── parser.ts   # Import/export Praat TextGrid
│   │   ├── canvas/         # Canvas rendering utilities
│   │   │   ├── spectrogram.ts  # Spectrogram image rendering
│   │   │   ├── waveform.ts     # Waveform rendering
│   │   │   └── overlays.ts     # Pitch, formant tracks
│   │   └── types.ts        # TypeScript type definitions
│   ├── components/
│   │   ├── Waveform.svelte
│   │   ├── Spectrogram.svelte
│   │   ├── AnnotationEditor.svelte
│   │   ├── Tier.svelte
│   │   ├── DataPoint.svelte
│   │   ├── Toolbar.svelte
│   │   ├── OverlayControls.svelte
│   │   └── FileDropZone.svelte
│   ├── routes/
│   │   ├── +page.svelte    # Main application
│   │   └── +layout.svelte  # App shell
│   └── app.html
├── static/
│   └── pkg/                # praatfan-core-wasm (copy from build)
├── package.json
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
└── CLAUDE.md
```

## Architecture

### State Management (Svelte Stores)

All shared state lives in `src/lib/stores/`. Components subscribe to stores and react to changes.

Key stores:
- `audioBuffer` - Raw audio samples (Float32Array)
- `sampleRate` - Audio sample rate
- `timeRange` - Visible time window { start, end }
- `cursorPosition` - Current cursor time in seconds
- `selection` - Selected region { start, end } or null
- `analysisResults` - Computed pitch, formants, etc.
- `annotations` - Tier data with intervals and boundaries

### Canvas Rendering Strategy

**Spectrogram:**
1. Compute once via WASM `to_spectrogram()`
2. Apply colormap → ImageData
3. Cache as ImageBitmap
4. Redraw visible portion on zoom/pan
5. Overlay tracks (pitch, formants) drawn separately

**Waveform:**
1. Downsample for display (min/max per pixel column)
2. Draw as path on canvas
3. Redraw on zoom/pan

**Overlays:**
- Cursor: Vertical line, updated via requestAnimationFrame during playback
- Selection: Semi-transparent rectangle
- Pitch/Formants: SVG paths or canvas paths on overlay canvas

### Layer Structure (per display widget)

```
┌─────────────────────────────────┐
│ Cursor layer (animated)         │  z-index: 3
├─────────────────────────────────┤
│ Selection layer                 │  z-index: 2
├─────────────────────────────────┤
│ Overlay tracks (pitch, etc.)    │  z-index: 1
├─────────────────────────────────┤
│ Base image (spectrogram/wave)   │  z-index: 0
└─────────────────────────────────┘
```

## Features to Implement

### Phase 1: Core Viewing
- [ ] Load audio file (drag & drop)
- [ ] Waveform display
- [ ] Spectrogram display
- [ ] Synchronized zoom/scroll (wheel + drag)
- [ ] Audio playback (selection, visible window)
- [ ] Cursor tracking during playback

### Phase 2: Acoustic Overlays
- [ ] Pitch (F0) track
- [ ] Intensity track
- [ ] Formants (F1-F4) with bandwidth coloring
- [ ] Toggle checkboxes for each overlay
- [ ] HNR, CoG, Spectral tilt

### Phase 3: Annotations
- [ ] TextGrid import
- [ ] Tier display with intervals
- [ ] Text editing (click to select, type to edit)
- [ ] Add/remove boundaries (double-click, right-click)
- [ ] TextGrid export
- [ ] Undo system

### Phase 4: Data Points
- [ ] Add points (double-click on spectrogram)
- [ ] Display as vertical lines with markers
- [ ] Drag to move
- [ ] Right-click to remove
- [ ] TSV export with acoustic values + annotations

### Phase 5: Polish
- [ ] Keyboard shortcuts (Space, Tab, Escape, 1-5, Ctrl+Z, etc.)
- [ ] Configuration (colors, pitch range, formant presets)
- [ ] Responsive layout
- [ ] PWA support (offline)

## Key Differences from Desktop Ozen

| Aspect | Desktop (PyQt6) | Web (Svelte) |
|--------|-----------------|--------------|
| Acoustic analysis | parselmouth | praatfan-core-wasm |
| Audio playback | sounddevice | Web Audio API |
| Rendering | pyqtgraph | Canvas API |
| File access | Direct filesystem | File API (user selects) |
| Save | Direct to disk | Download / localStorage |

## Keyboard Shortcuts (Target)

| Key | Action |
|-----|--------|
| Space | Play selection / pause |
| Escape | Stop playback / deselect |
| Tab | Play visible window |
| Scroll wheel | Zoom (centered on cursor) |
| Shift + drag | Pan view |
| Double-click (annotation) | Add boundary |
| Double-click (spectrogram) | Add data point |
| Delete | Remove hovered boundary |
| Ctrl+Z / Cmd+Z | Undo |
| 1-5 | Switch annotation tier |
| Ctrl+S | Download annotations |
| Ctrl+O | Open file dialog |

## WASM Integration

The praatfan-core-wasm package provides:

```typescript
import init, { Sound, Pitch, Formant, Intensity, Harmonicity, Spectrum, Spectrogram } from './pkg/praatfan_core_wasm.js';

// Initialize WASM (once at startup)
await init();

// Create Sound from samples
const sound = new Sound(samples, sampleRate);

// Compute analyses
const pitch = sound.to_pitch(0.01, 75, 600);
const formant = sound.to_formant_burg(0.01, 5, 5500, 0.025, 50);
const intensity = sound.to_intensity(75, 0.01);
const spectrogram = sound.to_spectrogram(0.005, 5000, 0.005, 20, 'gaussian');

// Get values
const f0Values = pitch.values();       // Float64Array
const times = pitch.times();           // Float64Array
const f1 = formant.get_value_at_time(1, time, 'hertz', 'linear');

// IMPORTANT: Free WASM objects when done
sound.free();
pitch.free();
```

## Related Projects

- [ozen](../ozen) - Desktop version (Python/PyQt6)
- [praatfan-core-rs](../praatfan-core-rs) - Rust acoustic analysis library with WASM support

## Resources

- [Svelte documentation](https://svelte.dev/docs)
- [SvelteKit documentation](https://kit.svelte.dev/docs)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
