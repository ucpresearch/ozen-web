# ozen-web

A web-based acoustic analysis and annotation tool for speech research, providing Praat-compatible analysis entirely in the browser.

## Documentation

**📚 Full documentation available at:** [https://ucpresearch.github.io/ozen-web/](https://ucpresearch.github.io/ozen-web/)

- **[Getting Started](https://ucpresearch.github.io/ozen-web/getting-started.html)** — Installation and first use
- **[Tutorial](https://ucpresearch.github.io/ozen-web/tutorial/)** — Complete workflow guide (30 minutes)
- **[Features](https://ucpresearch.github.io/ozen-web/features/)** — Detailed feature documentation
- **[Embedding Guide](https://ucpresearch.github.io/ozen-web/embedding/)** — Embed in websites and documents
- **[Reference](https://ucpresearch.github.io/ozen-web/reference/)** — Keyboard shortcuts, configuration, file formats

## Features

- **Audio Analysis**: Load WAV, FLAC, MP3, or OGG files for acoustic analysis
- **Microphone Recording**: Record audio directly from your microphone with save to WAV
- **Visualizations**: Synchronized waveform and spectrogram displays
- **Acoustic Overlays**: Pitch (F0), Formants (F1-F4), Intensity, HNR, Center of Gravity, Spectral Tilt, A1-P0
- **Annotations**: Multi-tier annotation editor with TextGrid import/export
- **Data Points**: Collect acoustic measurements at specific time/frequency locations
- **Mobile Viewer**: Touch-optimized view at `/viewer` with pinch-to-zoom and swipe gestures
- **Long Audio Support**: Files >60s defer analysis until zoomed in, preventing UI hangs
- **Multiple Backends**: Choose between local WASM or remote CDN-hosted analysis engines
- **Offline/PWA Ready**: Runs entirely in the browser with app icons for home screen installation

## Quick Start

### Prerequisites

- Node.js 18+

### Setup

```bash
# Install dependencies
npm install

# Copy WASM package from praatfan-core-clean
mkdir -p static/wasm/praatfan
cp -r ../praatfan-core-clean/rust/pkg/* static/wasm/praatfan/

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

1. **Load audio**: Drag & drop an audio file, click to browse, or record from microphone
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

## Embedding with Pre-loaded Audio

The viewer page (`viewer.html` in the static build) supports URL parameters for iframe embedding with pre-configured audio and overlays.

### Directory Structure

For Quarto/R Markdown projects, the recommended structure is:

```
your-project/
├── your-document.qmd          # Your Quarto source
├── your-document.html         # Rendered output
├── audio.wav                  # Your audio files
├── ozen-web/                  # Copy of build/ directory
│   ├── viewer.html
│   ├── _app/
│   ├── wasm/
│   └── ... (all build contents)
└── scripts/
    └── create-data-url.R      # Helper scripts (optional)
```

### Basic Usage

```html
<iframe
  data-external="1"
  src="./ozen-web/viewer.html?audio=https://cdn.example.com/audio.wav&overlays=pitch,formants,hnr"
  width="100%"
  height="600"
  frameborder="0">
</iframe>
```

**Note**: The `data-external="1"` attribute is required when using Quarto with `embed-resources: true` (see Important section below).

### URL Parameters

#### `audio` - Audio File URL

Load audio from a URL on page load.

**Supported URL types:**
- Remote HTTPS: `?audio=https://example.com/audio.wav`
- Relative path: `?audio=samples/demo.wav` or `?audio=../audio.wav`
- Same-origin: `?audio=/static/audio/demo.wav`
- Data URL (legacy): `?audio=data:audio/wav;base64,UklGRiQAAABXQVZF...`

**Recommended**: Use the helper scripts (`scripts/create-iframe.py` or `scripts/create-iframe.R`) to generate iframes with correct relative paths automatically.

**CORS Requirement**: Remote URLs must send `Access-Control-Allow-Origin` header.

**Example Apache config** (`.htaccess`):
```apache
<FilesMatch "\.(wav|mp3|ogg|flac)$">
  Header set Access-Control-Allow-Origin "*"
</FilesMatch>
```

#### `overlays` - Phonetic Property Visibility

Control which acoustic overlays are displayed.

**Format**: Comma-separated list (case-insensitive)

**Supported values:**
- `pitch` or `f0` - Fundamental frequency (F0)
- `formants` - Resonant frequencies (F1-F4)
- `intensity` - Sound pressure level
- `hnr` - Harmonics-to-Noise Ratio
- `cog` - Center of Gravity
- `spectraltilt` - Spectral tilt
- `a1p0` - A1-P0 nasal measure
- `all` - Enable all overlays

**Default** (no parameter): `pitch,formants`

**Examples:**
```
?audio=file.wav&overlays=pitch,formants,hnr
?audio=file.wav&overlays=all
?audio=file.wav&overlays=pitch
```

### Helper Scripts for Quarto/R Markdown

**For Quarto/R Markdown documents**, use the provided helper scripts to generate iframe HTML with correct relative paths:

**Python (Command line):**
```bash
python scripts/create-iframe.py audio.wav
python scripts/create-iframe.py audio.wav --overlays pitch,formants,hnr
python scripts/create-iframe.py audio.wav --overlays pitch,formants --height 800
python scripts/create-iframe.py samples/audio.wav --viewer-url ./ozen-web/viewer.html
```

**Python (In Jupyter/Quarto):**
```python
import sys
sys.path.append('scripts')
from create_iframe import create_embedded_viewer

# Generate iframe HTML (default height: 600)
html = create_embedded_viewer("audio.wav", overlays="pitch,formants,hnr")

# Custom height in pixels
html = create_embedded_viewer("audio.wav", overlays="pitch,formants", height=800)

# Custom height as percentage
html = create_embedded_viewer("audio.wav", overlays="pitch,formants", height="80%")
print(html)
```

**R (Command line):**
```bash
Rscript scripts/create-iframe.R audio.wav
Rscript scripts/create-iframe.R audio.wav "pitch,formants,hnr"
Rscript scripts/create-iframe.R audio.wav "pitch,formants" "./ozen-web/viewer.html"
Rscript scripts/create-iframe.R audio.wav "pitch,formants" "./ozen-web/viewer.html" 800
```

**R (In R Markdown/Quarto):**
```r
source("scripts/create-iframe.R")

# Generate iframe HTML (default height: 600)
html <- create_embedded_viewer("audio.wav", overlays = "pitch,formants,hnr")

# Custom height in pixels
html <- create_embedded_viewer("audio.wav", overlays = "pitch,formants", height = 800)

# Custom height as percentage
html <- create_embedded_viewer("audio.wav", overlays = "pitch,formants", height = "80%")
htmltools::HTML(html)
```

The scripts automatically calculate the correct relative path from the viewer to the audio file, handling any directory structure.

### Complete Examples

**Minimal** (defaults):
```html
<iframe data-external="1" src="./ozen-web/viewer.html?audio=audio.wav"></iframe>
```

**Custom overlays**:
```html
<iframe data-external="1" src="./ozen-web/viewer.html?audio=audio.wav&overlays=pitch,formants,intensity,hnr"></iframe>
```

**All overlays**:
```html
<iframe data-external="1" src="./ozen-web/viewer.html?audio=audio.wav&overlays=all"></iframe>
```

**Remote CDN**:
```html
<iframe data-external="1" src="./ozen-web/viewer.html?audio=https://cdn.example.com/sample.wav&overlays=pitch,formants"></iframe>
```

**Relative path (use helper scripts for correct calculation)**:
```html
<iframe data-external="1" src="./ozen-web/viewer.html?audio=../audio.wav&overlays=pitch,formants"></iframe>
```

### Error Handling

If audio fails to load:
1. Error message displays with details
2. "Retry" button attempts reload
3. Manual file load/record options remain available

User can still toggle overlays via settings drawer regardless of URL configuration.

### Important: Quarto `embed-resources` Setting

**CRITICAL**: When using Quarto with `embed-resources: true`, you **must** add `data-external="1"` to iframe tags to prevent Quarto from embedding the viewer as a data URL:

```html
<iframe
  data-external="1"
  src="./ozen-web/viewer.html?audio=audio.wav&overlays=pitch,formants"
  width="100%"
  height="600">
</iframe>
```

**Why?** Quarto's `embed-resources: true` converts iframe sources to data URLs by default. However, the viewer uses ES6 module imports which **cannot resolve** in data URL contexts - this is a browser limitation. Without `data-external="1"`, you'll see console errors like:

```
<link rel=modulepreload> has no `href` value
Failed to resolve module specifier './_app/immutable/entry/start.js'
```

**The helper scripts (`create-iframe.R` and `create-iframe.py`) automatically include this attribute**, so use them when possible.

### Important: Serving Quarto/R Markdown Documents

**Browser Security Restriction**: Browsers block `file://` URLs from loading iframes for security reasons. When you open a Quarto-rendered HTML file directly (double-click), embedded viewer iframes will fail with:
```
Not allowed to load local resource: file:///...
```

**Solution**: Serve the document over HTTP instead:

**Python:**
```bash
# Using the provided helper script
python scripts/serve-quarto.py [directory] [port]

# Or using Python's built-in server
python -m http.server 8000

# Then open: http://localhost:8000/your-document.html
```

**R:**
```r
# Using the provided helper script
source("scripts/serve-quarto.R")
serve_quarto()  # Serves current directory on port 8000

# Or using servr package directly
servr::httd(port = 8000)

# Then open: http://localhost:8000/your-document.html
```

**Alternative**: Deploy to a web server (GitHub Pages, Netlify, etc.) where HTTP is automatic.

### Limitations

- **Quarto embed-resources**: Must use `data-external="1"` attribute on iframes (see section above)
- **Remote files**: Recommended <100MB (browser memory)
- **HTTPS**: Remote URLs require HTTPS on HTTPS pages
- **Local viewing**: Must use HTTP server, not `file://` URLs (browsers block file:// iframes)
- **CORS**: Remote audio URLs must send `Access-Control-Allow-Origin` header

## Configuration

Place a `config.yaml` file in the app directory to customize colors, formant presets, and display settings. See `static/config.yaml` for available options.

## Analysis Backends

The app supports multiple acoustic analysis backends, selectable from the dropdown in the UI:

| Backend | Description | License |
|---------|-------------|---------|
| **praatfan-local** (default) | Local WASM bundled with app | MIT/Apache-2.0 |
| **praatfan** | Remote CDN (praatfan-core-clean) | MIT/Apache-2.0 |
| **praatfan-gpl** | Remote CDN (full Praat reimplementation) | GPL |

- **praatfan-local**: Uses the WASM files in `static/wasm/praatfan/`. Best for offline use and fastest loading.
- **praatfan**: Clean-room Rust implementation loaded from GitHub Pages CDN.
- **praatfan-gpl**: Full Praat algorithm reimplementation, GPL-licensed, loaded from CDN.

All backends provide Praat-compatible acoustic analysis (pitch, formants, intensity, harmonicity, spectrogram).

## Long Audio Handling

For audio files longer than 60 seconds, the app defers full analysis to prevent UI freezing:

1. **On load**: Waveform displays immediately, spectrogram shows "Zoom in for spectrogram"
2. **When zoomed**: Once the visible window is ≤60s, analysis runs for that region only
3. **On-demand**: Analysis results update as you pan/zoom through the file

This allows working with arbitrarily long recordings while maintaining responsive UI.

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) - Web framework
- [praatfan](https://github.com/UCPresearch/praatfan-core-clean) - Acoustic analysis (Praat-compatible)
- Web Audio API - Audio playback
- Canvas API - Visualization rendering

## Related Projects

- [praatfan-core-rs](https://github.com/UCPresearch/praatfan-core-rs) - Rust acoustic analysis library (GPL)
- [praatfan-core-clean](https://github.com/UCPresearch/praatfan-core-clean) - Clean-room Rust implementation (MIT/Apache-2.0)
- [Praat](https://www.praat.org/) - The original speech analysis software

## License

MIT
