#!/usr/bin/env node
/**
 * Post-build script to convert absolute paths to relative paths in SPA build output.
 *
 * SvelteKit's paths.relative setting doesn't work with SPA fallback pages,
 * so we fix the paths manually after the build.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const BUILD_DIR = 'build';

function fixHtmlFile(filePath) {
	let content = readFileSync(filePath, 'utf-8');
	const originalContent = content;

	// Replace href="/_app/ with href="./_app/
	content = content.replace(/href="\/_app\//g, 'href="./_app/');

	// Replace src="/_app/ with src="./_app/
	content = content.replace(/src="\/_app\//g, 'src="./_app/');

	// Replace import("/_app/ with import("./_app/
	content = content.replace(/import\("\/_app\//g, 'import("./_app/');

	// Replace href="/favicon.png with href="./favicon.png
	content = content.replace(/href="\/favicon\.png/g, 'href="./favicon.png');

	// Replace href="/pkg/ with href="./pkg/
	content = content.replace(/href="\/pkg\//g, 'href="./pkg/');
	content = content.replace(/src="\/pkg\//g, 'src="./pkg/');

	// Replace static base: "" with dynamic base path detection
	// This allows the app to work from any subdirectory
	// Handle data: URLs gracefully (return empty string)
	content = content.replace(
		/base:\s*""/g,
		'base: location.protocol === "data:" ? "" : new URL(".", location.href).pathname.slice(0, -1)'
	);

	// Also fix existing base path detection that uses location without .href
	// This pattern appears when rebuild occurs after a previous build
	content = content.replace(
		/base:\s*new URL\("\."\s*,\s*location\)\.pathname\.slice\(0,\s*-1\)/g,
		'base: location.protocol === "data:" ? "" : new URL(".", location.href).pathname.slice(0, -1)'
	);

	if (content !== originalContent) {
		writeFileSync(filePath, content);
		console.log(`Fixed: ${filePath}`);
		return true;
	}
	return false;
}

function fixJsFile(filePath) {
	let content = readFileSync(filePath, 'utf-8');
	const originalContent = content;

	// Fix fetch calls that use template strings with base path
	// Pattern: `${var}/_app/` where var is empty becomes `/_app/`
	// We need to replace the runtime path construction

	// Replace "/_app/ with "./_app/ (string literals)
	content = content.replace(/"\/(_app\/[^"]*)/g, '"./$1');

	// Replace '/_app/ with './_app/ (string literals)
	content = content.replace(/'\/(_app\/[^']*)/g, "'./$1");

	// Replace `/_app/ with `./_app/ (template literals without interpolation)
	content = content.replace(/`\/(_app\/[^`]*)`/g, '`./$1`');

	// Fix paths in template literals that end with /_app/...
	// This handles cases like `${base}/_app/version.json` where base is empty
	content = content.replace(/\$\{[^}]+\}\/_app\//g, './_app/');

	if (content !== originalContent) {
		writeFileSync(filePath, content);
		console.log(`Fixed: ${filePath}`);
		return true;
	}
	return false;
}

function processDirectory(dir) {
	let fixedCount = 0;
	const files = readdirSync(dir);

	for (const file of files) {
		const filePath = join(dir, file);
		const stat = statSync(filePath);

		if (stat.isDirectory()) {
			fixedCount += processDirectory(filePath);
		} else if (file.endsWith('.html')) {
			if (fixHtmlFile(filePath)) {
				fixedCount++;
			}
		} else if (file.endsWith('.js')) {
			if (fixJsFile(filePath)) {
				fixedCount++;
			}
		}
	}

	return fixedCount;
}

console.log('Converting absolute paths to relative paths...');
const fixedCount = processDirectory(BUILD_DIR);
console.log(`Done. Fixed ${fixedCount} file(s).`);
