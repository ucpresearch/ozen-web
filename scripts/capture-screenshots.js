/**
 * Capture documentation screenshots locally.
 *
 * Usage:  npm run screenshots        (builds, captures, and copies to docs/)
 *    or:  node scripts/capture-screenshots.js   (assumes build/ exists)
 *
 * Starts a Vite preview server on port 4173, runs the Playwright-based
 * capture script in scripts/screenshots/, copies results to docs/screenshots/,
 * then shuts down the server.
 *
 * Prerequisites (one-time):
 *   cd scripts/screenshots && npx playwright install chromium
 */

import { spawn } from 'child_process';
import { cpSync, mkdirSync } from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SCREENSHOTS_SRC = path.join(ROOT, 'docs-src', 'screenshots');
const SCREENSHOTS_DST = path.join(ROOT, 'docs', 'screenshots');
const PREVIEW_URL = 'http://localhost:4173';
const TIMEOUT_MS = 60_000;

/** Wait until the preview server responds. */
function waitForServer(url, timeout) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on('error', () => {
          if (Date.now() - start > timeout) {
            reject(new Error(`Server not ready after ${timeout}ms`));
          } else {
            setTimeout(check, 500);
          }
        });
    };
    check();
  });
}

/** Run a command and return its exit code. */
function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...opts });
    child.on('close', (code) => resolve(code));
    child.on('error', reject);
  });
}

// --- Main ---

// 1. Install screenshot dependencies if needed
const screenshotsDir = path.join(ROOT, 'scripts', 'screenshots');
const code1 = await run('npm', ['install'], { cwd: screenshotsDir });
if (code1 !== 0) {
  console.error('Failed to install screenshot dependencies.');
  process.exit(1);
}

// 2. Start preview server
console.log('Starting preview server...');
const server = spawn('npx', ['vite', 'preview', '--port', '4173'], {
  cwd: ROOT,
  stdio: 'ignore',
  detached: true,
});

try {
  await waitForServer(PREVIEW_URL, TIMEOUT_MS);
  console.log('Preview server ready.\n');

  // 3. Capture screenshots (saves to docs-src/screenshots/)
  const code = await run('node', ['capture-screenshots.js'], {
    cwd: screenshotsDir,
  });

  if (code !== 0) {
    process.exitCode = code;
  } else {
    // 4. Copy to docs/screenshots/
    mkdirSync(SCREENSHOTS_DST, { recursive: true });
    cpSync(SCREENSHOTS_SRC, SCREENSHOTS_DST, { recursive: true });
    console.log(`\nCopied screenshots to docs/screenshots/`);
  }
} finally {
  // 5. Stop server
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill('SIGTERM');
  }
}
