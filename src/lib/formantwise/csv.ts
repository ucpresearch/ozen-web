/**
 * CSV/TSV parsing for interval input and TSV output building for formantwise results.
 */

import type { ParsedIntervals, PipelineResults, VowelSummary, FrameResult } from './types';

// Column name aliases for start/end detection (case-insensitive)
const START_ALIASES = ['start', 'begin', 'onset', 'xmin'];
const END_ALIASES = ['end', 'offset', 'xmax'];

/**
 * Parse a CSV/TSV file with start/end columns into ParsedIntervals.
 * Auto-detects delimiter (tab vs comma). Handles BOM and quoted fields.
 */
export function parseIntervalCSV(text: string): ParsedIntervals {
	// Strip UTF-8 BOM
	if (text.charCodeAt(0) === 0xfeff) {
		text = text.slice(1);
	}

	const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
	if (lines.length < 2) {
		throw new Error('CSV must have a header row and at least one data row');
	}

	// Auto-detect delimiter: tab if any line contains tab, else comma
	const delimiter = lines.some((l) => l.includes('\t')) ? '\t' : ',';

	const headerFields = splitCSVLine(lines[0], delimiter);
	const headers = headerFields.map((h) => h.trim());

	// Find start/end column indices
	const startIdx = findColumnIndex(headers, START_ALIASES);
	const endIdx = findColumnIndex(headers, END_ALIASES);

	if (startIdx === -1) {
		throw new Error(
			`Could not find start column. Expected one of: ${START_ALIASES.join(', ')}`
		);
	}
	if (endIdx === -1) {
		throw new Error(`Could not find end column. Expected one of: ${END_ALIASES.join(', ')}`);
	}

	const rows: Record<string, string>[] = [];
	const startValues: number[] = [];
	const endValues: number[] = [];

	for (let i = 1; i < lines.length; i++) {
		const fields = splitCSVLine(lines[i], delimiter);
		const startStr = (fields[startIdx] ?? '').trim();
		const endStr = (fields[endIdx] ?? '').trim();
		const startVal = parseFloat(startStr);
		const endVal = parseFloat(endStr);

		// Skip rows with non-numeric start/end
		if (isNaN(startVal) || isNaN(endVal)) continue;

		const row: Record<string, string> = {};
		for (let j = 0; j < headers.length; j++) {
			row[headers[j]] = (fields[j] ?? '').trim();
		}
		rows.push(row);
		startValues.push(startVal);
		endValues.push(endVal);
	}

	if (rows.length === 0) {
		throw new Error('No valid data rows found (all rows had non-numeric start/end values)');
	}

	// Build flat Float64Array [s1, e1, s2, e2, ...]
	const intervals = new Float64Array(rows.length * 2);
	for (let i = 0; i < rows.length; i++) {
		intervals[i * 2] = startValues[i];
		intervals[i * 2 + 1] = endValues[i];
	}

	return { headers, rows, intervals, source: 'csv' };
}

// ── Measurement point types ──────────────────────────────────────────────────

export type MeasurementPoint = { type: 'stable' } | { type: 'percent'; value: number };

/**
 * Parse a measurement points spec string like "stable", "50", "20,50,80", "50,stable".
 * Returns array of MeasurementPoint. Throws on invalid input.
 */
export function parsePointsSpec(spec: string): MeasurementPoint[] {
	const parts = spec.split(',').map((s) => s.trim()).filter((s) => s !== '');
	if (parts.length === 0) {
		throw new Error('At least one measurement point required');
	}
	return parts.map((p) => {
		if (p.toLowerCase() === 'stable') {
			return { type: 'stable' as const };
		}
		const n = parseFloat(p);
		if (isNaN(n) || n < 0 || n > 100) {
			throw new Error(`Invalid point "${p}": use a number 0-100 or "stable"`);
		}
		return { type: 'percent' as const, value: n };
	});
}

/** Measurement columns in output TSV. */
const MEASUREMENT_COLS = [
	'point', 'time', 'onset', 'offset', 'duration',
	'F1', 'F2', 'F3', 'B1', 'B2', 'B3', 'F0', 'confidence'
];

/**
 * Build output TSV from parsed intervals, pipeline results, and measurement points.
 * Each input interval × each measurement point produces one output row.
 * Rows without a matching VowelSummary get empty measurement cells.
 */
export function buildOutputTSV(
	parsed: ParsedIntervals,
	results: PipelineResults,
	points: MeasurementPoint[]
): string {
	const summaryMap = new Map<number, VowelSummary>();
	for (const vs of results.vowel_summaries) {
		summaryMap.set(vs.vowel_id, vs);
	}

	// Build index of frame_results by vowel_id for percentage lookups
	const framesByVowel = new Map<number, FrameResult[]>();
	for (const fr of results.frame_results) {
		if (fr.vowel_id != null) {
			let arr = framesByVowel.get(fr.vowel_id);
			if (!arr) {
				arr = [];
				framesByVowel.set(fr.vowel_id, arr);
			}
			arr.push(fr);
		}
	}

	const allHeaders = [...parsed.headers, ...MEASUREMENT_COLS];
	const lines: string[] = [allHeaders.join('\t')];

	for (let i = 0; i < parsed.rows.length; i++) {
		const row = parsed.rows[i];
		const vs = summaryMap.get(i);
		const passthrough = parsed.headers.map((h) => row[h] ?? '');

		if (!vs) {
			// No measurements for this interval — one empty row
			lines.push([...passthrough, ...MEASUREMENT_COLS.map(() => '')].join('\t'));
			continue;
		}

		for (const pt of points) {
			const m = getMeasurement(pt, vs, framesByVowel.get(i));
			lines.push([...passthrough, ...m].join('\t'));
		}
	}

	return lines.join('\n');
}

/**
 * Get measurement values for a single point on a single vowel.
 */
function getMeasurement(
	pt: MeasurementPoint,
	vs: VowelSummary,
	frames: FrameResult[] | undefined
): string[] {
	if (pt.type === 'stable') {
		return [
			'stable',
			fmt(vs.stable_time),
			fmt(vs.onset), fmt(vs.offset), fmt(vs.duration),
			fmt(vs.f1_mid), fmt(vs.f2_mid), fmt(vs.f3_mid),
			fmt(vs.b1_mid), fmt(vs.b2_mid), fmt(vs.b3_mid),
			fmt(vs.f0_mid), fmt(vs.confidence)
		];
	}

	// Percentage point
	const pct = pt.value;
	const targetTime = vs.onset + (vs.offset - vs.onset) * (pct / 100);

	// Special case: 50% can use the pre-computed midpoint values
	if (pct === 50) {
		return [
			'50',
			fmt(vs.midpoint),
			fmt(vs.onset), fmt(vs.offset), fmt(vs.duration),
			fmt(vs.f1_mp), fmt(vs.f2_mp), fmt(vs.f3_mp),
			fmt(vs.b1_mp), fmt(vs.b2_mp), fmt(vs.b3_mp),
			fmt(vs.f0_mid), fmt(vs.confidence)
		];
	}

	// Other percentages: find nearest frame in frame_results
	const fr = findNearestFrame(frames, targetTime);
	if (fr) {
		return [
			String(pct),
			fmt(targetTime),
			fmt(vs.onset), fmt(vs.offset), fmt(vs.duration),
			fmt(fr.f1), fmt(fr.f2), fmt(fr.f3),
			fmt(fr.b1), fmt(fr.b2), fmt(fr.b3),
			fmt(fr.f0), fmt(fr.confidence)
		];
	}

	// No frame data available
	return [
		String(pct), fmt(targetTime),
		fmt(vs.onset), fmt(vs.offset), fmt(vs.duration),
		'', '', '', '', '', '', '', ''
	];
}

function findNearestFrame(frames: FrameResult[] | undefined, targetTime: number): FrameResult | null {
	if (!frames || frames.length === 0) return null;
	let best = frames[0];
	let bestDist = Math.abs(best.time - targetTime);
	for (let i = 1; i < frames.length; i++) {
		const dist = Math.abs(frames[i].time - targetTime);
		if (dist < bestDist) {
			best = frames[i];
			bestDist = dist;
		}
	}
	return best;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findColumnIndex(headers: string[], aliases: string[]): number {
	const lower = headers.map((h) => h.toLowerCase());
	for (const alias of aliases) {
		const idx = lower.indexOf(alias);
		if (idx !== -1) return idx;
	}
	return -1;
}

/** Format a number for TSV output. */
function fmt(value: number | undefined | null): string {
	if (value === undefined || value === null || isNaN(value)) return '';
	return String(value);
}

/**
 * Split a CSV/TSV line respecting double-quote escaping.
 * Handles fields like "hello, world" and escaped quotes "say ""hi""".
 */
function splitCSVLine(line: string, delimiter: string): string[] {
	const fields: string[] = [];
	let current = '';
	let inQuotes = false;
	let i = 0;

	while (i < line.length) {
		const ch = line[i];

		if (inQuotes) {
			if (ch === '"') {
				if (i + 1 < line.length && line[i + 1] === '"') {
					// Escaped quote
					current += '"';
					i += 2;
				} else {
					// End of quoted field
					inQuotes = false;
					i++;
				}
			} else {
				current += ch;
				i++;
			}
		} else {
			if (ch === '"' && current === '') {
				inQuotes = true;
				i++;
			} else if (ch === delimiter) {
				fields.push(current);
				current = '';
				i++;
			} else {
				current += ch;
				i++;
			}
		}
	}
	fields.push(current);
	return fields;
}
