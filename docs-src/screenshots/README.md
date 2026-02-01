# Screenshots Directory

## Current Status

✅ **Placeholder screenshots created** (gray boxes with text)

These placeholders allow the documentation to build without broken image links. They will be replaced with actual screenshots when you run the capture process.

## Generating Real Screenshots

### Option 1: Automatic (Recommended)

Screenshots will be automatically generated on first GitHub Actions deployment:

1. Push to GitHub
2. GitHub Actions runs `deploy-docs.yml`
3. Real screenshots are captured and committed
4. Documentation updates with real images

**No action needed** - just deploy!

### Option 2: Local Generation

To generate real screenshots locally:

```bash
# Terminal 1: Start preview server
cd /path/to/Ozen-web
npm run build
npm run preview

# Terminal 2: Generate screenshots
cd scripts/screenshots
./capture-local.sh
```

**Requirements:**
- Node.js 18+
- Playwright (installed by script)
- Preview server running at http://localhost:4173

**Time:** ~2-5 minutes (first run installs Playwright browsers ~100MB)

## Screenshot List

Current placeholders (20 total):

- `main-interface-overview.png` - Main interface with audio loaded
- `tutorial-01-empty-interface.png` - Empty interface with drop zone
- `tutorial-01-drag-drop.png` - Dragging audio file (highlighted)
- `tutorial-01-audio-loaded.png` - Audio successfully loaded
- `tutorial-02-cursor-placement.png` - Cursor at specific position
- `tutorial-02-selection.png` - Selected audio region
- `tutorial-02-zoom-demo.png` - Zoom demonstration
- `tutorial-03-pitch-overlay.png` - Spectrogram with pitch
- `tutorial-03-formant-overlay.png` - Spectrogram with formants
- `tutorial-03-all-overlays.png` - All overlays enabled
- `tutorial-04-multitiered.png` - Multiple annotation tiers
- `tutorial-05-datapoint-values.png` - Data point with values
- `tutorial-06-export-textgrid.png` - TextGrid export dialog
- `mobile-viewer-landscape.png` - Mobile viewer (landscape)
- `mobile-viewer-portrait.png` - Mobile viewer (portrait)
- `data-points-collection.png` - Multiple data points
- `acoustic-overlays-all.png` - All acoustic overlays

## Automated Updates

Once deployed, screenshots auto-update:

- **On push** - When docs/ changes
- **Weekly** - Mondays at 2am UTC
- **Workflow** - `.github/workflows/update-screenshots.yml`

## Adding New Screenshots

1. Edit `scripts/screenshots/screenshot-config.json`
2. Add new scenario with actions
3. Run capture script or wait for GitHub Actions
4. Reference in docs: `![Alt](../screenshots/name.png)`

See `scripts/screenshots/README.md` for scenario configuration details.

## Troubleshooting

**Placeholders not replaced:**
- Check GitHub Actions logs for errors
- Verify preview server was running during capture
- Test locally with `./capture-local.sh`

**Missing screenshots:**
- Check `screenshot-config.json` includes the scenario
- Verify filename matches reference in docs
- Re-run capture script

**Screenshot capture fails:**
- Ensure test audio exists: `scripts/screenshots/test-audio/sample.wav`
- Check Playwright browsers installed: `npx playwright install chromium`
- Verify preview server responds: `curl http://localhost:4173`

---

**Status:** Placeholders ready for deployment
**Next:** Deploy to GitHub Pages or run local capture
