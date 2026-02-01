# Screenshot Configuration Status

## Summary

**Total screenshots:** 31 (previously 20)
**Newly added:** 11 screenshots
**Automated:** 28 screenshots
**Require manual capture:** 3 screenshots

## Newly Added Screenshots

### Automated Screenshots (8)

1. **tutorial-02-values-panel.png**
   - Shows values panel with acoustic measurements at cursor
   - Clipped to right sidebar area (900px from left)

2. **tutorial-03-overlay-checkboxes.png**
   - Shows overlay toggle checkboxes (pitch, formants, intensity, etc.)
   - Clipped to control area in right sidebar

3. **intensity-overlay.png**
   - Spectrogram with intensity overlay enabled
   - Similar to pitch/formant overlay screenshots

4. **tutorial-04-add-tier.png**
   - Shows "Add Tier" button in annotation controls
   - Clipped to annotation control area

5. **tutorial-04-add-boundary.png**
   - Empty annotation tier ready for boundary addition
   - Note: Actual boundary addition requires double-click (manual step)

6. **tutorial-05-add-datapoint.png**
   - Cursor positioned where data point will be added
   - Shows state before double-click to add point

7. **tutorial-05-multiple-datapoints.png**
   - Multiple data points visible on spectrogram
   - Shows 3 data points at different positions

8. **tutorial-06-export-tsv.png**
   - Interface with data point ready for TSV export
   - Shows state before clicking export (native dialog not capturable)

### Manual Screenshots Required (3)

These screenshots cannot be automated due to technical limitations:

1. **tutorial-04-boundary-menu.png**
   - **What:** Right-click context menu on boundary
   - **Why manual:** Cannot automate right-click context menus
   - **How to capture:**
     1. Load audio
     2. Add annotation tier
     3. Double-click tier to add boundary
     4. Right-click boundary
     5. Screenshot while menu is visible

2. **tutorial-04-edit-label.png**
   - **What:** Text input visible for editing interval label
   - **Why manual:** Requires simulating double-click on interval and keyboard input
   - **How to capture:**
     1. Load audio
     2. Add annotation tier with boundaries
     3. Double-click an interval
     4. Screenshot while text input is active

3. **microphone-permission.png**
   - **What:** Browser microphone permission dialog
   - **Why manual:** Browser security prevents automation of permission dialogs
   - **How to capture:**
     1. Click microphone icon in fresh browser session
     2. Screenshot when browser permission prompt appears
     3. Best to capture on Chrome, Firefox, and Safari separately

## Screenshot Automation Capabilities

### ✅ Can Automate

- Loading audio files
- Toggling overlays (pitch, formants, intensity, HNR, CoG, etc.)
- Clicking on spectrogram
- Dragging selections
- Adding data points (double-click)
- Creating annotation tiers
- Clipping specific UI regions
- Different viewport sizes (desktop, mobile)

### ❌ Cannot Automate

- Right-click context menus
- Browser permission dialogs
- Native file dialogs (Save As, Open File)
- Inline text editing (requires complex keyboard simulation)
- OS-level drag-and-drop hover effects
- Mouse wheel scroll/zoom actions
- Before/after comparison screenshots

## Running Screenshot Capture

### Prerequisites

```bash
cd scripts/screenshots
npm install  # Already installed
```

### Capture Process

```bash
# Start production preview server (Terminal 1)
cd /home/urielc/local/decfiles/private/Dev/git/ozen-web
npm run build
npm run preview

# Run screenshot capture (Terminal 2)
cd scripts/screenshots
npm run capture:prod
```

### Expected Output

- 28 automated screenshots will be generated in `docs/screenshots/`
- 3 screenshots will have placeholder images with "MANUAL SCREENSHOT REQUIRED" notes
- Total: 31 PNG files

### After Automated Capture

Manually capture the 3 remaining screenshots:

```bash
# After manual capture, save to:
docs/screenshots/tutorial-04-boundary-menu.png
docs/screenshots/tutorial-04-edit-label.png
docs/screenshots/microphone-permission.png
```

## Screenshot Details

### Tutorial 01 (Loading Audio) - 3 screenshots
- ✅ tutorial-01-empty-interface.png
- ✅ tutorial-01-drag-drop.png (automated placeholder - manual enhancement optional)
- ✅ tutorial-01-audio-loaded.png

### Tutorial 02 (Exploring Audio) - 4 screenshots
- ✅ tutorial-02-cursor-placement.png
- ✅ tutorial-02-selection.png
- ✅ tutorial-02-zoom-demo.png
- ✅ tutorial-02-values-panel.png (NEW)

### Tutorial 03 (Acoustic Analysis) - 5 screenshots
- ✅ tutorial-03-overlay-checkboxes.png (NEW)
- ✅ tutorial-03-pitch-overlay.png
- ✅ tutorial-03-formant-overlay.png
- ✅ tutorial-03-all-overlays.png
- ✅ intensity-overlay.png (NEW)

### Tutorial 04 (Annotations) - 5 screenshots
- ✅ tutorial-04-add-tier.png (NEW)
- ✅ tutorial-04-add-boundary.png (NEW)
- ❌ tutorial-04-boundary-menu.png (NEW - MANUAL REQUIRED)
- ❌ tutorial-04-edit-label.png (NEW - MANUAL REQUIRED)
- ✅ tutorial-04-multitiered.png

### Tutorial 05 (Data Collection) - 3 screenshots
- ✅ tutorial-05-add-datapoint.png (NEW)
- ✅ tutorial-05-multiple-datapoints.png (NEW)
- ✅ tutorial-05-datapoint-values.png

### Tutorial 06 (Exporting) - 2 screenshots
- ✅ tutorial-06-export-textgrid.png
- ✅ tutorial-06-export-tsv.png (NEW)

### Feature Documentation - 5 screenshots
- ✅ main-interface-overview.png
- ✅ acoustic-overlays-all.png
- ✅ data-points-collection.png
- ✅ mobile-viewer-portrait.png
- ✅ mobile-viewer-landscape.png

### Miscellaneous - 1 screenshot
- ❌ microphone-permission.png (NEW - MANUAL REQUIRED)

## Clip Coordinates Used

Clipping allows capturing specific UI regions:

- **Values panel:** `{"x": 900, "y": 0, "width": 380, "height": 720}`
- **Overlay checkboxes:** `{"x": 900, "y": 80, "width": 380, "height": 300}`
- **Add tier button:** `{"x": 0, "y": 550, "width": 300, "height": 170}`
- **Annotation tier area:** `{"x": 0, "y": 450, "width": 1280, "height": 270}`

These coordinates assume 1280x720 viewport and may need adjustment if UI layout changes.

## Maintenance

### When UI Changes

1. Run automated screenshot capture to regenerate all 28 screenshots
2. Review diffs to ensure screenshots still capture intended UI
3. Update clip coordinates if UI layout changed
4. Manually recapture the 3 manual screenshots if affected areas changed

### Adding New Screenshots

1. Add entry to `screenshot-config.json`
2. Define actions needed to reach desired state
3. Set clip coordinates if capturing specific region
4. Run capture and review output
5. Update this status document

## Next Steps

1. ✅ Run automated screenshot capture (28 screenshots)
2. ❌ Manually capture 3 remaining screenshots
3. ✅ Verify all tutorial pages render with images
4. ✅ Commit screenshots to repository
5. ✅ Update GitHub Actions to regenerate screenshots on UI changes

## Summary

✅ **28 automated screenshots** - Fully automated, stay current with code changes
❌ **3 manual screenshots** - One-time manual capture needed
📝 **Total: 31 screenshots** covering all tutorial sections and features

The automated system handles 90% of screenshot needs. The 3 manual screenshots are edge cases involving browser security restrictions or complex interactions that cannot be automated.
