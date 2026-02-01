# Screenshot Configuration Status

## Summary

**Total screenshots:** 20 (previously 17)
**Newly added:** 3 screenshots that were referenced in docs but missing from automation

## Added Screenshots

### 1. tutorial-01-drag-drop.png

**Status:** ✅ Added to config (basic version)
**Location in docs:** `docs/tutorial/01-loading-audio.qmd`
**What it captures:** Empty interface with drop zone

**Limitation:** Cannot automate the actual drag-and-drop hover effect (would require simulating OS-level drag operation). Currently captures the empty interface.

**Manual enhancement recommended:**
- Take a manual screenshot while actually dragging a file over the browser
- Shows the blue highlight border that appears during drag-over

**Alternative:** Keep automated version (shows the drop zone UI which is still useful)

### 2. tutorial-02-zoom-demo.png

**Status:** ✅ Added to config (basic version)
**Location in docs:** `docs/tutorial/02-exploring-audio.qmd`
**What it captures:** Default zoom level after loading audio

**Limitation:** Cannot automate mouse wheel zoom or show before/after comparison. Currently captures single zoom level.

**Manual enhancement recommended:**
- Create a composite image showing before (zoomed out) and after (zoomed in) side-by-side
- Or annotate the screenshot with arrows/labels explaining zoom

**Alternative:** Keep automated version and update docs to describe zoom in text rather than visual comparison

### 3. tutorial-06-export-textgrid.png

**Status:** ✅ Added to config (basic version)
**Location in docs:** `docs/tutorial/06-exporting.qmd`
**What it captures:** Interface with annotation tier ready for export

**Limitation:** Cannot capture native OS "Save As" dialog (browser security prevents it). Shows interface state before clicking export button.

**Manual enhancement recommended:**
- Take manual screenshot of actual save dialog after clicking export
- Shows Windows/Mac/Linux file save dialog

**Alternative:** Keep automated version showing the interface, add separate manual screenshot of save dialog, or update docs to describe the export process in text

## Screenshot Automation Capabilities

### ✅ Can Automate

- Loading audio files
- Toggling overlays (pitch, formants, intensity, etc.)
- Clicking on spectrogram
- Dragging selections
- Adding data points
- Creating annotation tiers
- Basic UI states

### ❌ Cannot Automate (Require Manual Capture)

- OS-level drag-and-drop hover effects
- Mouse wheel scroll/zoom actions
- Native file dialogs (Save As, Open File)
- Before/after comparison screenshots
- Annotated screenshots with arrows/labels
- Context menus (right-click menus)
- Hover states with tooltips

## Recommendations

### Option 1: Use Automated Screenshots As-Is (Recommended)

**Pros:**
- Fully automated
- Stay up-to-date with app changes
- No manual work needed

**Cons:**
- Missing some visual details (drag effect, save dialog, zoom comparison)

**Action:** Update documentation text to compensate for missing visual details

### Option 2: Manual Enhancement for Key Screenshots

**Pros:**
- More accurate representation
- Better user experience
- Shows exact UI interactions

**Cons:**
- Requires manual work
- Screenshots become outdated as UI changes
- Need to remember to update them

**Action:** Take 3 manual screenshots and add them to `docs/screenshots/manual/`:
- `tutorial-01-drag-drop-manual.png` (actual drag hover)
- `tutorial-02-zoom-demo-manual.png` (before/after composite)
- `tutorial-06-export-textgrid-manual.png` (save dialog)

Then reference manual versions in docs where needed.

### Option 3: Hybrid Approach (Best)

Use automated screenshots for most cases, but add manual annotations for specific screenshots:

```bash
# After automated capture:
cd docs/screenshots

# Add annotation arrows/labels using imagemagick or Photoshop:
convert tutorial-02-zoom-demo.png \
  -fill red -draw "circle 640,300 650,310" \
  -pointsize 20 -fill white \
  -annotate +650+300 "Zoom level shown here" \
  tutorial-02-zoom-demo.png
```

## Current Config

```json
{
  "screenshots": [
    // ... 17 original screenshots ...

    // 3 newly added:
    {
      "name": "tutorial-01-drag-drop",
      "actions": [{"type": "wait", "ms": 1000}],
      "description": "Empty interface (manual screenshot recommended for drag effect)"
    },
    {
      "name": "tutorial-02-zoom-demo",
      "actions": [
        {"type": "loadAudio", "file": "test-audio/sample.wav"},
        {"type": "wait", "ms": 3000}
      ],
      "description": "Default zoom (manual composite recommended for before/after)"
    },
    {
      "name": "tutorial-06-export-textgrid",
      "actions": [
        {"type": "loadAudio", "file": "test-audio/sample.wav"},
        {"type": "wait", "ms": 3000},
        {"type": "addTier", "name": "words"}
      ],
      "description": "Ready for export (native save dialog not capturable)"
    }
  ]
}
```

## Next Steps

1. **Run screenshot capture** to generate all 20 screenshots:
   ```bash
   cd scripts/screenshots
   npm run capture:prod
   ```

2. **Review generated screenshots** to see if automated versions are acceptable:
   ```bash
   ls -lh ../../docs/screenshots/*.png
   open ../../docs/screenshots/tutorial-01-drag-drop.png
   open ../../docs/screenshots/tutorial-02-zoom-demo.png
   open ../../docs/screenshots/tutorial-06-export-textgrid.png
   ```

3. **Decide on enhancement strategy:**
   - Keep automated versions (easiest)
   - Add manual versions (most accurate)
   - Add annotations (best of both)

4. **Update documentation if needed** to clarify what screenshots show

## Summary

✅ **All referenced screenshots now have automated versions**
⚠️ **3 screenshots may benefit from manual enhancement** (optional)
📝 **Total screenshots: 20** (was 17)

The automated versions ensure documentation builds without broken images and stay current with code changes. Manual enhancements can be added later if desired.
