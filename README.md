# ozen-web

Web-based acoustic analysis and annotation tool. Browser version of [Ozen](../ozen).

## Features

- Load and analyze audio files (WAV, FLAC, MP3, OGG)
- Waveform and spectrogram display
- Acoustic overlays: Pitch, Intensity, Formants, HNR, CoG
- Annotation editor with multiple tiers
- TextGrid import/export (Praat compatible)
- Data collection points with TSV export
- Runs entirely in browser - no server required

## Development

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

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) - Framework
- [praatfan-core-wasm](../praatfan-core-rs) - Acoustic analysis
- Web Audio API - Playback
- Canvas API - Visualization

## Related

- [ozen](../ozen) - Desktop version (Python/PyQt6)
- [praatfan-core-rs](../praatfan-core-rs) - Rust acoustic analysis library

## License

MIT
