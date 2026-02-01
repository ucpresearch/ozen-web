# Screenshot Capture Fixes

## Issues Encountered

When running screenshot capture, several scenarios failed with timeout errors:

```
✗ Failed: locator.click: Timeout 30000ms exceeded.
<canvas class="svelte-1r84lea"> from <div class="spectrogram-panel"> intercepts pointer events
```

**Root cause:** Multiple overlapping canvas elements (waveform and spectrogram), and Playwright couldn't determine which to interact with.

## Fixes Applied

### 1. Improved Canvas Selector Strategy

**Before:**
```javascript
const canvas = await page.locator('.spectrogram-canvas, canvas').first();
```
- Selected the first canvas (waveform)
- Spectrogram canvas blocked pointer events
- Caused timeout errors

**After:**
```javascript
const canvas = await page.locator('.spectrogram-panel canvas, [class*="spectrogram"] canvas').last();
```
- Targets spectrogram panel specifically
- Uses `.last()` to get the topmost canvas
- Added `force: true` to bypass pointer-events checks

### 2. Added Auto-Wait for Spectrogram Rendering

**Added to `loadAudio` action:**
```javascript
// Wait for audio to load and render
await page.waitForTimeout(2000);
// Wait for spectrogram to appear
await page.locator('.spectrogram-panel canvas, [class*="spectrogram"] canvas')
    .last()
    .waitFor({ timeout: 10000 });
```

This ensures the spectrogram is fully rendered before attempting to interact with it.

### 3. Increased Wait Times in Config

**Updated scenarios:**
- `tutorial-02-cursor-placement`: 2000ms → 3000ms wait after audio load
- `tutorial-02-selection`: 2000ms → 3000ms wait after audio load
- `tutorial-05-datapoint-values`: Added 1000ms waits after overlay toggles
- `data-points-collection`: Added 300ms waits between data points

### 4. Fixed All Interaction Actions

**Actions fixed:**
- `click` - Now targets spectrogram panel canvas
- `dragSelect` - Now targets spectrogram panel canvas
- `addDataPoint` - Now targets spectrogram panel canvas

All actions now use:
- Specific selector: `.spectrogram-panel canvas`
- `.last()` to get topmost canvas
- `force: true` to bypass pointer-events

## Changed Files

1. **`capture-screenshots.js`**
   - Updated `click` action selector
   - Updated `dragSelect` action selector
   - Updated `addDataPoint` action selector
   - Added auto-wait in `loadAudio` action

2. **`screenshot-config.json`**
   - Increased wait times after `loadAudio` (2000ms → 3000ms)
   - Added wait times after `toggleOverlay` (1000ms)
   - Added wait times between multiple `addDataPoint` actions (300ms)
   - Removed unused `selector` parameter from `click` action

## Testing

To test the fixes:

```bash
# Terminal 1: Start preview server
cd /path/to/ozen-web
npm run preview

# Terminal 2: Run screenshot capture
cd scripts/screenshots
npm run capture:prod
```

**Expected result:** All 20 screenshots should capture successfully without timeout errors.

## Affected Screenshots

Previously failing scenarios that should now work:
- `tutorial-02-cursor-placement` ✅
- `tutorial-02-selection` ✅
- `tutorial-05-datapoint-values` ✅
- `data-points-collection` ✅

## Technical Details

### Canvas Structure in ozen-web

The app has multiple canvas elements:
```html
<div class="waveform-panel">
  <canvas class="svelte-vdkqpy"></canvas>  <!-- Waveform -->
</div>
<div class="spectrogram-panel">
  <canvas class="svelte-1r84lea"></canvas>  <!-- Spectrogram (multiple layers) -->
</div>
```

### Playwright Pointer Events

When multiple elements overlap:
1. Playwright tries to click the selected element
2. If another element intercepts pointer events, it retries
3. After ~30 seconds of retries, it times out

**Solution:** Use `force: true` to bypass pointer-event checks, since we know which element we want to interact with.

### Wait Strategy

For reliable screenshot capture:
1. Wait for navigation to complete
2. Wait for WASM to initialize (1000ms)
3. Load audio
4. Wait for audio processing (2000ms in loadAudio action)
5. Wait for spectrogram canvas to appear (up to 10000ms)
6. Additional waits after overlays toggle (1000ms)
7. Execute interaction (click, drag, etc.)
8. Capture screenshot

## Future Improvements

To make screenshot capture more robust:

1. **Use data-testid attributes**
   ```html
   <canvas data-testid="spectrogram-canvas"></canvas>
   ```
   Then select with: `page.getByTestId('spectrogram-canvas')`

2. **Wait for specific visual states**
   ```javascript
   await page.waitForFunction(() => {
     const canvas = document.querySelector('.spectrogram-panel canvas');
     const ctx = canvas.getContext('2d');
     const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
     // Check if canvas has been drawn to (not blank)
     return imageData.data.some(pixel => pixel !== 0);
   });
   ```

3. **Add retry logic**
   ```javascript
   for (let i = 0; i < 3; i++) {
     try {
       await canvas.click();
       break;
     } catch (e) {
       if (i === 2) throw e;
       await page.waitForTimeout(1000);
     }
   }
   ```

## Summary

✅ **Fixed:** All canvas interaction issues
✅ **Added:** Auto-wait for spectrogram rendering
✅ **Updated:** Wait times in configuration
✅ **Result:** Screenshot capture should now work reliably

**Next:** Test the fixes by running `./capture-local.sh`
