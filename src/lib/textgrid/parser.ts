/**
 * TextGrid Parser
 *
 * Parses and exports Praat TextGrid files for speech annotation.
 * Supports both short format (compact) and long format (human-readable).
 *
 * Short format example:
 *   "ooTextFile"
 *   "TextGrid"
 *   0
 *   1.5
 *   <exists>
 *   1
 *   "IntervalTier"
 *   "words"
 *   0
 *   1.5
 *   2
 *   0
 *   0.5
 *   "hello"
 *   0.5
 *   1.5
 *   "world"
 *
 * Long format example:
 *   File type = "ooTextFile"
 *   Object class = "TextGrid"
 *   xmin = 0
 *   xmax = 1.5
 *   ...
 *
 * @module textgrid/parser
 */

import type { Tier, Interval, Point } from '$lib/types';

/**
 * Parse a Praat TextGrid file content into structured tier data.
 * Automatically detects short vs long format.
 *
 * @param content - Raw TextGrid file content as string
 * @returns Object containing parsed tiers and time bounds
 * @throws Error if parsing fails
 */
export function parseTextGrid(content: string): { tiers: Tier[]; xmin: number; xmax: number } {
	const lines = content.split(/\r?\n/);
	let i = 0;

	// Helper to get next non-empty line
	function nextLine(): string {
		while (i < lines.length && lines[i].trim() === '') i++;
		return i < lines.length ? lines[i++].trim() : '';
	}

	// Helper to extract value from line like 'key = value' or just 'value'
	function extractValue(line: string): string {
		const match = line.match(/=\s*(.+)$/);
		return match ? match[1].trim() : line.trim();
	}

	// Helper to extract string (removes quotes and unescapes doubled quotes)
	function extractString(line: string): string {
		const val = extractValue(line);
		return val.replace(/^"|"$/g, '').replace(/""/g, '"');
	}

	// Detect format (short vs long)
	const firstLine = nextLine();
	if (!firstLine) {
		throw new Error('Empty or invalid TextGrid file');
	}
	const isShortFormat = firstLine === '"ooTextFile"' || !firstLine.includes('=');

	// Reset
	i = 0;

	if (isShortFormat) {
		return parseShortFormat(lines);
	} else {
		return parseLongFormat(lines);
	}
}

function parseShortFormat(lines: string[]): { tiers: Tier[]; xmin: number; xmax: number } {
	let i = 0;
	const tiers: Tier[] = [];

	function nextLine(): string {
		while (i < lines.length && lines[i].trim() === '') i++;
		return i < lines.length ? lines[i++].trim() : '';
	}

	function readString(): string {
		return nextLine().replace(/^"|"$/g, '').replace(/""/g, '"');
	}

	function readNumber(): number {
		const val = parseFloat(nextLine());
		if (isNaN(val)) throw new Error('Invalid number in TextGrid file');
		return val;
	}

	// File type header
	readString(); // "ooTextFile"
	readString(); // "TextGrid"

	const xmin = readNumber();
	const xmax = readNumber();
	nextLine(); // <exists>
	const numTiers = readNumber();

	for (let t = 0; t < numTiers; t++) {
		const tierType = readString(); // "IntervalTier" or "TextTier"
		const name = readString();
		const tierXmin = readNumber();
		const tierXmax = readNumber();
		const numItems = readNumber();

		const tier: Tier = {
			name,
			type: tierType === 'IntervalTier' ? 'interval' : 'point',
			intervals: []
		};

		for (let j = 0; j < numItems; j++) {
			if (tier.type === 'interval') {
				const start = readNumber();
				const end = readNumber();
				const text = readString();
				tier.intervals.push({ start, end, text });
			} else {
				const time = readNumber();
				const text = readString();
				tier.intervals.push({ start: time, end: time, text });
			}
		}

		tiers.push(tier);
	}

	return { tiers, xmin, xmax };
}

function parseLongFormat(lines: string[]): { tiers: Tier[]; xmin: number; xmax: number } {
	let i = 0;
	const tiers: Tier[] = [];

	function nextLine(): string {
		while (i < lines.length && lines[i].trim() === '') i++;
		return i < lines.length ? lines[i++].trim() : '';
	}

	function extractValue(line: string): string {
		const match = line.match(/=\s*(.+)$/);
		return match ? match[1].trim() : line.trim();
	}

	function extractNumber(line: string): number {
		const val = parseFloat(extractValue(line));
		if (isNaN(val)) throw new Error(`Invalid number in TextGrid file: ${line}`);
		return val;
	}

	function extractString(line: string): string {
		return extractValue(line).replace(/^"|"$/g, '').replace(/""/g, '"');
	}

	// Skip headers
	nextLine(); // File type
	nextLine(); // Object class

	let xmin = 0;
	let xmax = 0;

	// Read until we find tiers
	while (i < lines.length) {
		const line = nextLine();

		if (line.startsWith('xmin')) {
			xmin = extractNumber(line);
		} else if (line.startsWith('xmax')) {
			xmax = extractNumber(line);
		} else if (line.includes('size =')) {
			const numTiers = extractNumber(line);

			// Skip "item []:"
			nextLine();

			for (let t = 0; t < numTiers; t++) {
				// Read tier
				nextLine(); // item [n]:
				const classLine = nextLine();
				const tierType = extractString(classLine);
				const nameLine = nextLine();
				const name = extractString(nameLine);
				const tierXminLine = nextLine();
				const tierXmin = extractNumber(tierXminLine);
				const tierXmaxLine = nextLine();
				const tierXmax = extractNumber(tierXmaxLine);
				const sizeLine = nextLine();
				const numItems = extractNumber(sizeLine);

				const tier: Tier = {
					name,
					type: tierType === 'IntervalTier' ? 'interval' : 'point',
					intervals: []
				};

				for (let j = 0; j < numItems; j++) {
					nextLine(); // intervals [n]: or points [n]:

					if (tier.type === 'interval') {
						const start = extractNumber(nextLine());
						const end = extractNumber(nextLine());
						const text = extractString(nextLine());
						tier.intervals.push({ start, end, text });
					} else {
						const time = extractNumber(nextLine());
						const text = extractString(nextLine());
						tier.intervals.push({ start: time, end: time, text });
					}
				}

				tiers.push(tier);
			}
			break;
		}
	}

	return { tiers, xmin, xmax };
}

/**
 * Export tiers to TextGrid format (long format).
 */
export function exportTextGrid(tiers: Tier[], xmin: number, xmax: number): string {
	const lines: string[] = [];

	lines.push('File type = "ooTextFile"');
	lines.push('Object class = "TextGrid"');
	lines.push('');
	lines.push(`xmin = ${xmin}`);
	lines.push(`xmax = ${xmax}`);
	lines.push('tiers? <exists>');
	lines.push(`size = ${tiers.length}`);
	lines.push('item []:');

	for (let t = 0; t < tiers.length; t++) {
		const tier = tiers[t];
		lines.push(`    item [${t + 1}]:`);
		lines.push(`        class = "${tier.type === 'interval' ? 'IntervalTier' : 'TextTier'}"`);
		lines.push(`        name = "${escapeString(tier.name)}"`);

		const tierXmin = tier.intervals.length > 0 ? tier.intervals[0].start : xmin;
		const tierXmax = tier.intervals.length > 0 ? tier.intervals[tier.intervals.length - 1].end : xmax;

		lines.push(`        xmin = ${tierXmin}`);
		lines.push(`        xmax = ${tierXmax}`);

		if (tier.type === 'interval') {
			lines.push(`        intervals: size = ${tier.intervals.length}`);
			for (let j = 0; j < tier.intervals.length; j++) {
				const interval = tier.intervals[j];
				lines.push(`        intervals [${j + 1}]:`);
				lines.push(`            xmin = ${interval.start}`);
				lines.push(`            xmax = ${interval.end}`);
				lines.push(`            text = "${escapeString(interval.text)}"`);
			}
		} else {
			lines.push(`        points: size = ${tier.intervals.length}`);
			for (let j = 0; j < tier.intervals.length; j++) {
				const point = tier.intervals[j];
				lines.push(`        points [${j + 1}]:`);
				lines.push(`            number = ${point.start}`);
				lines.push(`            mark = "${escapeString(point.text)}"`);
			}
		}
	}

	return lines.join('\n');
}

function escapeString(s: string): string {
	return s.replace(/"/g, '""');
}
