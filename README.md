# ozen-web

A web-based acoustic analysis and annotation tool for speech research. This is the browser version of [Ozen](https://github.com/your-repo/ozen), providing Praat-compatible analysis entirely in the browser.

## Features

- **Audio Analysis**: Load WAV, FLAC, MP3, or OGG files for acoustic analysis
- **Visualizations**: Synchronized waveform and spectrogram displays
- **Acoustic Overlays**: Pitch (F0), Formants (F1-F4), Intensity, HNR, Center of Gravity, Spectral Tilt, A1-P0
- **Annotations**: Multi-tier annotation editor with TextGrid import/export
- **Offline**: Runs entirely in the browser - no server required after loading

## Quick Start

### Prerequisites

- Node.js 18+

### Setup

```bash
# Install dependencies
npm install

# Download and extract WASM package
# Get praatfan-core-wasm.zip from:
# https://github.com/your-repo/praatfan-core-rs/releases
unzip praatfan-core-wasm.zip -d static/

# Start development server
npm run dev
```

### Production Build

```bash
npm run build
```

The `build/` folder contains everything needed. Deploy to any static file host - the app uses relative paths and works from any subdirectory:

```bash
# Deploy to root
cp -r build/* /var/www/html/

# Or deploy to subdirectory
cp -r build/* /var/www/html/apps/ozen/

# Or upload to S3
aws s3 sync build/ s3://bucket/path/to/app/
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed setup, deployment, and architecture documentation.

## Usage

1. **Load audio**: Drag & drop an audio file or click to browse
2. **Navigate**: Scroll to zoom, shift+drag to pan
3. **Select**: Click and drag on the spectrogram to select a region
4. **Play**: Press Space to play selection, Tab to play visible window
5. **Annotate**: Double-click on a tier to add boundaries, click text to edit
6. **Export**: Use the Export button to save annotations as TextGrid

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/pause selection |
| Tab | Play visible window |
| Escape | Stop, clear selection |
| Scroll | Zoom in/out |
| 1-5 | Select annotation tier |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |

## Configuration

Place a `config.yaml` file in the app directory to customize colors, formant presets, and display settings. See `static/config.yaml` for available options.

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) - Web framework
- [praatfan-core-wasm](https://github.com/your-repo/praatfan-core-rs) - Acoustic analysis (Praat-compatible)
- Web Audio API - Audio playback
- Canvas API - Visualization rendering

## Related Projects

- [Ozen](https://github.com/your-repo/ozen) - Desktop version (Python/PyQt6)
- [praatfan-core-rs](https://github.com/your-repo/praatfan-core-rs) - Rust acoustic analysis library
- [Praat](https://www.praat.org/) - The original speech analysis software

## License

MIT
