import { chromium } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.OZEN_URL || 'http://localhost:4173';
const OUTPUT_DIR = path.join(__dirname, '../../docs/screenshots');
const CONFIG_FILE = path.join(__dirname, 'screenshot-config.json');

// Ensure output directory exists
await fs.mkdir(OUTPUT_DIR, { recursive: true });

// Load configuration
const config = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf-8'));

console.log(`📸 Starting screenshot capture...`);
console.log(`   Base URL: ${BASE_URL}`);
console.log(`   Output: ${OUTPUT_DIR}`);
console.log(`   Screenshots to capture: ${config.screenshots.length}\n`);

// Launch browser
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

let successCount = 0;
let failureCount = 0;

for (const screenshot of config.screenshots) {
  const context = await browser.newContext({
    viewport: screenshot.viewport,
    deviceScaleFactor: 2, // Retina/HiDPI for crisp screenshots
  });

  const page = await context.newPage();

  try {
    console.log(`📷 Capturing: ${screenshot.name}`);
    console.log(`   Route: ${screenshot.route}`);
    console.log(`   Viewport: ${screenshot.viewport.width}x${screenshot.viewport.height}`);

    // Navigate to page
    const url = `${BASE_URL}${screenshot.route}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for app to be ready (wait for WASM to load)
    await page.waitForTimeout(3000);

    // Execute actions
    for (const action of screenshot.actions) {
      await executeAction(page, action);
    }

    // Capture screenshot
    const outputPath = path.join(OUTPUT_DIR, `${screenshot.name}.png`);
    const screenshotOptions = {
      path: outputPath,
      fullPage: false,
    };

    if (screenshot.clip) {
      screenshotOptions.clip = screenshot.clip;
    }

    await page.screenshot(screenshotOptions);

    console.log(`   ✓ Saved to: ${path.basename(outputPath)}\n`);
    successCount++;

  } catch (error) {
    console.error(`   ✗ Failed: ${error.message}\n`);
    failureCount++;
  } finally {
    await context.close();
  }
}

await browser.close();

console.log(`\n✨ Screenshot capture complete!`);
console.log(`   Success: ${successCount}`);
console.log(`   Failed: ${failureCount}`);
console.log(`   Total: ${config.screenshots.length}`);

if (failureCount > 0) {
  process.exit(1);
}

/**
 * Execute a screenshot action
 */
async function executeAction(page, action) {
  switch (action.type) {
    case 'wait':
      await page.waitForTimeout(action.ms);
      break;

    case 'loadAudio':
      // Simulate file input (this is a simplified version)
      // In reality, you'd need to interact with the file input element
      // For now, we'll assume audio can be loaded via direct manipulation
      console.log(`   → Load audio: ${action.file}`);
      const audioPath = path.join(__dirname, action.file);

      // Set file input if exists
      const fileInput = await page.locator('input[type="file"][accept*="audio"]').first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(audioPath);
        // Wait for audio to load and render
        await page.waitForTimeout(2000);
        // Wait for spectrogram to appear (look for canvas in spectrogram panel)
        await page.locator('.spectrogram-panel canvas, [class*="spectrogram"] canvas').last().waitFor({ timeout: 10000 });
      }
      break;

    case 'toggleOverlay':
      console.log(`   → Toggle overlay: ${action.overlay}`);
      // Find and click checkbox for overlay
      const checkbox = page.locator(`input[type="checkbox"][id*="${action.overlay}"], input[type="checkbox"][name*="${action.overlay}"]`).first();
      if (await checkbox.count() > 0) {
        await checkbox.click();
      }
      break;

    case 'click':
      console.log(`   → Click at position: (${action.position.x}, ${action.position.y})`);
      // Target spectrogram panel specifically to avoid waveform canvas
      const clickCanvas = await page.locator('.spectrogram-panel canvas, [class*="spectrogram"] canvas').last();
      await clickCanvas.click({
        position: action.position,
        force: true  // Bypass pointer-events check
      });
      break;

    case 'dragSelect':
      console.log(`   → Drag select: (${action.start.x},${action.start.y}) to (${action.end.x},${action.end.y})`);
      // Target spectrogram panel specifically
      const canvas = await page.locator('.spectrogram-panel canvas, [class*="spectrogram"] canvas').last();
      await canvas.hover({ position: action.start, force: true });
      await page.mouse.down();
      await canvas.hover({ position: action.end, force: true });
      await page.mouse.up();
      break;

    case 'addTier':
      console.log(`   → Add tier: ${action.name}`);
      // Click "Add Tier" button
      const addButton = page.locator('button:has-text("Add Tier"), button:has-text("+ Add Tier")').first();
      if (await addButton.count() > 0) {
        await addButton.click();
        await page.waitForTimeout(300);

        // Fill in tier name if input exists
        const nameInput = page.locator('input[type="text"]').last();
        if (await nameInput.count() > 0) {
          await nameInput.fill(action.name);
          await page.keyboard.press('Enter');
        }
      }
      break;

    case 'addDataPoint':
      console.log(`   → Add data point at: (${action.position.x}, ${action.position.y})`);
      // Target spectrogram panel specifically to avoid waveform canvas
      const spectrogramCanvas = await page.locator('.spectrogram-panel canvas, [class*="spectrogram"] canvas').last();
      await spectrogramCanvas.dblclick({
        position: action.position,
        force: true  // Bypass pointer-events check
      });
      break;

    default:
      console.warn(`   ⚠ Unknown action type: ${action.type}`);
  }

  // Small delay after each action
  await page.waitForTimeout(200);
}
