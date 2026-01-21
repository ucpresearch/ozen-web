# Development Guide

This guide covers setting up ozen-web for development and deployment.

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
│   │   └── textgrid/       # TextGrid parser
│   └── routes/             # SvelteKit pages
├── static/
│   ├── pkg/                # WASM package (not in git, copy manually)
│   └── config.yaml         # Optional configuration
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

## Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-repo/ozen-web.git
cd ozen-web
```

### 2. Install dependencies

```bash
npm install
```

### 3. Download WASM package

The WASM package provides the acoustic analysis engine. Download it from the praatfan-core-rs releases:

**Option A: Download from GitHub releases (recommended)**

1. Go to [praatfan-core-rs releases](https://github.com/your-repo/praatfan-core-rs/releases)
2. Download `praatfan-core-wasm.zip` from the latest release
3. Extract to `static/`:

```bash
unzip praatfan-core-wasm.zip -d static/
```

This creates `static/pkg/` with the WASM files.

**Option B: Build from source**

If you have praatfan-core-rs cloned locally:

```bash
cp -r ../praatfan-core-rs/wasm/pkg static/pkg
```

The `static/pkg/` directory should contain:
- `praat_core_wasm.js` - JavaScript bindings
- `praat_core_wasm_bg.wasm` - WebAssembly binary
- `praat_core_wasm.d.ts` - TypeScript definitions

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

This creates optimized output in the `build/` directory.

### Deploy

For static hosting (no server required):

1. Copy the `build/` directory to your web server
2. Copy `static/pkg/` to `build/pkg/` (WASM files)
3. Optionally copy `static/config.yaml` to `build/config.yaml`

Example deployment structure:
```
your-server/
├── index.html
├── _app/              # SvelteKit assets
├── pkg/               # WASM package
│   ├── praat_core_wasm.js
│   └── praat_core_wasm_bg.wasm
└── config.yaml        # Optional custom config
```

The app can be served from any static file host (Nginx, Apache, Netlify, Vercel, GitHub Pages, etc.).

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
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run check` | Run Svelte type checking |
| `npm run lint` | Run ESLint |

## Architecture Notes

### State Management

All shared state is managed through Svelte stores in `src/lib/stores/`:
- `audio.ts` - Loaded audio buffer and metadata
- `view.ts` - Viewport state (time range, cursor, selection)
- `analysis.ts` - Computed acoustic features
- `annotations.ts` - Annotation tiers with undo/redo
- `config.ts` - Application configuration

### WASM Integration

The praatfan-core-wasm library provides Praat-accurate acoustic analysis:
- Pitch extraction (autocorrelation method)
- Formant tracking (Burg's method)
- Intensity calculation
- Harmonicity (HNR)
- Spectrogram computation
- Spectral measures (CoG, spectral tilt)

WASM objects must be manually freed after use to prevent memory leaks.

### Canvas Rendering

Visualizations use layered HTML5 Canvas:
1. Base layer: Spectrogram/waveform image (cached)
2. Overlay layer: Pitch, formants, intensity tracks
3. Selection layer: Time selection highlight
4. Cursor layer: Playback position (animated)

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
