/**
 * Data Points Store
 *
 * Manages data collection points on the spectrogram.
 * Each point stores time, frequency, and acoustic measurements.
 *
 * Features:
 * - Add/remove/move data points
 * - Collect acoustic values at each point
 * - Export to TSV with acoustic values and annotations
 * - Undo support for point operations
 *
 * @module stores/dataPoints
 */

import { writable, get } from 'svelte/store';
import type { DataPoint } from '$lib/types';
import { analysisResults } from './analysis';
import { tiers } from './annotations';
import { saveUndo } from './undoManager';

/**
 * All data collection points.
 */
export const dataPoints = writable<DataPoint[]>([]);

/**
 * Currently hovered point ID (for highlighting).
 */
export const hoveredPointId = writable<number | null>(null);

/**
 * Currently dragging point ID.
 */
export const draggingPointId = writable<number | null>(null);

/**
 * Next point ID counter.
 */
let nextPointId = 1;

/**
 * Add a new data point at the specified position.
 * Automatically collects acoustic values at the point's time.
 *
 * @param time - Time position in seconds
 * @param frequency - Frequency position in Hz (click position)
 * @returns The newly created point
 */
export function addDataPoint(time: number, frequency: number): DataPoint {
	saveUndo();

	const acousticValues = collectAcousticValues(time);
	const annotationIntervals = collectAnnotationIntervals(time);

	const point: DataPoint = {
		id: nextPointId++,
		time,
		frequency,
		acousticValues,
		annotationIntervals
	};

	dataPoints.update(points => [...points, point]);

	return point;
}

/**
 * Remove a data point by ID.
 *
 * @param pointId - ID of the point to remove
 * @returns The removed point, or null if not found
 */
export function removeDataPoint(pointId: number): DataPoint | null {
	saveUndo();

	let removed: DataPoint | null = null;

	dataPoints.update(points => {
		const index = points.findIndex(p => p.id === pointId);
		if (index !== -1) {
			removed = points[index];
			return [...points.slice(0, index), ...points.slice(index + 1)];
		}
		return points;
	});

	return removed;
}

/**
 * Move a data point to a new position.
 * Updates acoustic values at the new position.
 *
 * @param pointId - ID of the point to move
 * @param newTime - New time position
 * @param newFrequency - New frequency position
 * @returns True if point was found and moved
 */
export function moveDataPoint(pointId: number, newTime: number, newFrequency: number): boolean {
	// Note: saveUndo is NOT called here because this function is called
	// continuously during drag. The caller (Spectrogram) should call
	// saveUndo when the drag starts.
	let found = false;

	dataPoints.update(points => {
		return points.map(p => {
			if (p.id === pointId) {
				found = true;

				// Recollect acoustic values at new position
				const acousticValues = collectAcousticValues(newTime);
				const annotationIntervals = collectAnnotationIntervals(newTime);

				return {
					...p,
					time: newTime,
					frequency: newFrequency,
					acousticValues,
					annotationIntervals
				};
			}
			return p;
		});
	});

	return found;
}

/**
 * Find the closest point to a given position within tolerance.
 *
 * @param time - Time position to search near
 * @param frequency - Frequency position to search near
 * @param timeTolerance - Maximum time difference in seconds
 * @param freqTolerance - Maximum frequency difference in Hz
 * @returns The closest point, or null if none within tolerance
 */
export function getPointAtPosition(
	time: number,
	frequency: number,
	timeTolerance: number = 0.02,
	freqTolerance: number = 100
): DataPoint | null {
	const points = get(dataPoints);
	let bestPoint: DataPoint | null = null;
	let bestDist = Infinity;

	for (const point of points) {
		const timeDiff = Math.abs(point.time - time);
		const freqDiff = Math.abs(point.frequency - frequency);

		if (timeDiff <= timeTolerance && freqDiff <= freqTolerance) {
			const dist = (timeDiff / timeTolerance) ** 2 + (freqDiff / freqTolerance) ** 2;
			if (dist < bestDist) {
				bestDist = dist;
				bestPoint = point;
			}
		}
	}

	return bestPoint;
}

/**
 * Clear all data points.
 */
export function clearDataPoints(): void {
	dataPoints.set([]);
	nextPointId = 1;
}

/**
 * Collect acoustic values at a given time from analysis results.
 */
function collectAcousticValues(time: number): Record<string, number | null> {
	const results = get(analysisResults);
	if (!results) return {};

	// Find the closest time index
	const { times } = results;
	let closestIdx = 0;
	let minDiff = Infinity;

	for (let i = 0; i < times.length; i++) {
		const diff = Math.abs(times[i] - time);
		if (diff < minDiff) {
			minDiff = diff;
			closestIdx = i;
		}
	}

	// Collect all acoustic values at this index
	return {
		Pitch: results.pitch[closestIdx],
		Intensity: results.intensity[closestIdx],
		F1: results.formants.f1[closestIdx],
		F2: results.formants.f2[closestIdx],
		F3: results.formants.f3[closestIdx],
		F4: results.formants.f4[closestIdx],
		B1: results.formants.b1[closestIdx],
		B2: results.formants.b2[closestIdx],
		B3: results.formants.b3[closestIdx],
		B4: results.formants.b4[closestIdx],
		HNR: results.harmonicity[closestIdx],
		CoG: results.cog[closestIdx],
		SpectralTilt: results.spectralTilt[closestIdx],
		'A1-P0': results.a1p0[closestIdx]
	};
}

/**
 * Collect annotation interval texts at a given time.
 */
function collectAnnotationIntervals(time: number): Record<string, string> {
	const allTiers = get(tiers);
	const intervals: Record<string, string> = {};

	for (const tier of allTiers) {
		for (const interval of tier.intervals) {
			if (time >= interval.start && time < interval.end) {
				intervals[tier.name] = interval.text;
				break;
			}
		}
	}

	return intervals;
}

/**
 * Export data points to TSV format.
 *
 * @returns TSV string content
 */
export function exportDataPointsTSV(): string {
	const points = get(dataPoints);
	const allTiers = get(tiers);

	if (points.length === 0) {
		return 'time\tfrequency\n';
	}

	// Collect all acoustic value keys
	const acousticKeys = new Set<string>();
	for (const point of points) {
		Object.keys(point.acousticValues).forEach(k => acousticKeys.add(k));
	}
	const sortedAcousticKeys = Array.from(acousticKeys).sort();

	// Get tier names
	const tierNames = allTiers.map(t => t.name);

	// Build header
	const header = ['time', 'frequency', ...sortedAcousticKeys, ...tierNames];

	// Build rows (sorted by time)
	const sortedPoints = [...points].sort((a, b) => a.time - b.time);

	const rows = sortedPoints.map(point => {
		const row: string[] = [
			point.time.toFixed(4),
			point.frequency.toFixed(1)
		];

		// Acoustic values
		for (const key of sortedAcousticKeys) {
			const val = point.acousticValues[key];
			row.push(val !== null && val !== undefined ? val.toFixed(2) : '');
		}

		// Annotation intervals (re-lookup at export time for freshness)
		const intervals = collectAnnotationIntervals(point.time);
		for (const tierName of tierNames) {
			row.push(intervals[tierName] || '');
		}

		return row;
	});

	// Join with tabs and newlines
	const lines = [header.join('\t'), ...rows.map(r => r.join('\t'))];
	return lines.join('\n');
}

/**
 * Import data points from TSV format.
 * Expects at least 'time' and 'frequency' columns.
 * Clears existing points before import.
 *
 * @param content - TSV file content
 * @returns Number of points imported, or -1 on error
 */
export function importDataPointsTSV(content: string): number {
	const lines = content.trim().split('\n');
	if (lines.length < 2) {
		return -1; // Need header + at least one data row
	}

	// Parse header to find time and frequency column indices
	const header = lines[0].split('\t').map(h => h.trim().toLowerCase());
	const timeIdx = header.indexOf('time');
	const freqIdx = header.indexOf('frequency');

	if (timeIdx === -1 || freqIdx === -1) {
		return -1; // Missing required columns
	}

	// Clear existing points
	clearDataPoints();

	// Parse data rows
	let importedCount = 0;
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		const cols = line.split('\t');
		const time = parseFloat(cols[timeIdx]);
		const freq = parseFloat(cols[freqIdx]);

		if (!isNaN(time) && !isNaN(freq)) {
			addDataPoint(time, freq);
			importedCount++;
		}
	}

	return importedCount;
}
