/**
 * Annotation Store
 *
 * Manages annotation tiers and intervals for speech transcription.
 * Supports TextGrid import/export for compatibility with Praat.
 *
 * Features:
 * - Multiple annotation tiers (interval or point tiers)
 * - Add/remove/rename tiers
 * - Add/remove/move boundaries within tiers
 * - Edit interval text labels
 * - Full undo/redo support
 * - TextGrid import and export
 *
 * @module stores/annotations
 */

import { writable, derived, get } from 'svelte/store';
import type { Tier, Interval } from '$lib/types';
import { parseTextGrid, exportTextGrid } from '$lib/textgrid/parser';
import { audioBuffer, sampleRate } from './audio';
import { saveUndo } from './undoManager';
import { config } from './config';

/**
 * All annotation tiers.
 */
export const tiers = writable<Tier[]>([]);

/**
 * Currently selected tier index.
 */
export const selectedTierIndex = writable<number>(0);

/**
 * Currently selected tier (derived).
 */
export const selectedTier = derived(
	[tiers, selectedTierIndex],
	([$tiers, $idx]) => $tiers[$idx] || null
);

/**
 * Currently selected interval index within the selected tier.
 */
export const selectedIntervalIndex = writable<number | null>(null);

/**
 * Load TextGrid from string content.
 */
export function loadTextGrid(content: string): void {
	try {
		const { tiers: parsedTiers } = parseTextGrid(content);
		saveUndo();
		tiers.set(parsedTiers);
		selectedTierIndex.set(0);
		selectedIntervalIndex.set(null);
	} catch (e) {
		console.error('Failed to parse TextGrid:', e);
		throw e;
	}
}

/**
 * Export tiers to TextGrid string.
 */
export function exportTiers(): string {
	const buffer = get(audioBuffer);
	const sr = get(sampleRate);
	const duration = buffer ? buffer.length / sr : 1;

	return exportTextGrid(get(tiers), 0, duration);
}

/**
 * Create a new empty tier.
 * Note: Tier creation is not undoable - users can remove tiers explicitly.
 */
export function addTier(name: string, type: 'interval' | 'point' = 'interval'): void {
	const buffer = get(audioBuffer);
	const sr = get(sampleRate);
	const duration = buffer ? buffer.length / sr : 1;

	const newTier: Tier = {
		name,
		type,
		intervals: type === 'interval' ? [{ start: 0, end: duration, text: '' }] : []
	};

	tiers.update(t => [...t, newTier]);
}

/**
 * Remove a tier by index.
 * Note: Tier removal is not undoable.
 */
export function removeTier(index: number): void {
	tiers.update(t => t.filter((_, i) => i !== index));
	const idx = get(selectedTierIndex);
	if (idx >= index && idx > 0) {
		selectedTierIndex.update(i => i - 1);
	}
}

/**
 * Rename a tier.
 * Note: Tier renaming is not undoable.
 */
export function renameTier(index: number, newName: string): void {
	tiers.update(t => t.map((tier, i) =>
		i === index ? { ...tier, name: newName } : tier
	));
}

/**
 * Snap threshold in seconds (50ms for easier snapping).
 */
const SNAP_THRESHOLD = 0.05;

/**
 * Find nearby boundary in upper tiers for snapping.
 */
function findSnapTarget(time: number, tierIdx: number, currentTiers: Tier[]): number | null {
	// Search all tiers above the current one
	for (let i = 0; i < tierIdx; i++) {
		const upperTier = currentTiers[i];
		if (upperTier.type !== 'interval') continue;

		for (const interval of upperTier.intervals) {
			// Check start boundary
			if (Math.abs(interval.start - time) <= SNAP_THRESHOLD) {
				return interval.start;
			}
			// Check end boundary
			if (Math.abs(interval.end - time) <= SNAP_THRESHOLD) {
				return interval.end;
			}
		}
	}
	return null;
}

/**
 * Add a boundary at a specific time in the selected tier.
 * Snaps to nearby boundaries in upper tiers.
 */
export function addBoundary(time: number): void {
	const tierIdx = get(selectedTierIndex);
	const currentTiers = get(tiers);

	if (tierIdx < 0 || tierIdx >= currentTiers.length) return;

	const tier = currentTiers[tierIdx];
	if (tier.type !== 'interval') return;

	// Check for snap target in upper tiers
	const snapTarget = findSnapTarget(time, tierIdx, currentTiers);
	const finalTime = snapTarget !== null ? snapTarget : time;

	// Find which interval contains this time
	const intervalIdx = tier.intervals.findIndex(
		int => finalTime > int.start && finalTime < int.end
	);

	if (intervalIdx === -1) return;

	saveUndo();

	const interval = tier.intervals[intervalIdx];
	const newInterval1: Interval = { start: interval.start, end: finalTime, text: interval.text };
	const newInterval2: Interval = { start: finalTime, end: interval.end, text: '' };

	tiers.update(t => {
		const newTiers = [...t];
		newTiers[tierIdx] = {
			...newTiers[tierIdx],
			intervals: [
				...newTiers[tierIdx].intervals.slice(0, intervalIdx),
				newInterval1,
				newInterval2,
				...newTiers[tierIdx].intervals.slice(intervalIdx + 1)
			]
		};
		return newTiers;
	});
}

/**
 * Remove a boundary at a specific index in the selected tier.
 * This merges the interval with the previous one.
 */
export function removeBoundary(intervalIndex: number): void {
	const tierIdx = get(selectedTierIndex);
	const currentTiers = get(tiers);

	if (tierIdx < 0 || tierIdx >= currentTiers.length) return;
	if (intervalIndex <= 0) return; // Can't remove first boundary

	const tier = currentTiers[tierIdx];
	if (tier.type !== 'interval') return;

	saveUndo();

	tiers.update(t => {
		const newTiers = [...t];
		const intervals = [...newTiers[tierIdx].intervals];

		// Merge with previous interval
		const prev = intervals[intervalIndex - 1];
		const current = intervals[intervalIndex];
		const merged: Interval = {
			start: prev.start,
			end: current.end,
			text: prev.text || current.text
		};

		intervals.splice(intervalIndex - 1, 2, merged);

		newTiers[tierIdx] = { ...newTiers[tierIdx], intervals };
		return newTiers;
	});
}

/**
 * Update text of an interval.
 */
export function updateIntervalText(tierIdx: number, intervalIdx: number, text: string): void {
	// Check if text actually changed before saving undo
	const currentTiers = get(tiers);
	if (tierIdx < currentTiers.length && intervalIdx < currentTiers[tierIdx].intervals.length) {
		const currentText = currentTiers[tierIdx].intervals[intervalIdx].text;
		if (currentText === text) return; // No change, skip
		saveUndo();
	}

	tiers.update(t => {
		const newTiers = [...t];
		if (tierIdx < newTiers.length && intervalIdx < newTiers[tierIdx].intervals.length) {
			newTiers[tierIdx] = {
				...newTiers[tierIdx],
				intervals: newTiers[tierIdx].intervals.map((int, i) =>
					i === intervalIdx ? { ...int, text } : int
				)
			};
		}
		return newTiers;
	});
}

/**
 * Move a boundary to a new time.
 * Snaps to nearby boundaries in upper tiers.
 *
 * Note: saveUndo is NOT called here because this function may be called
 * continuously during drag. The caller should call saveUndo when the drag starts.
 */
export function moveBoundary(intervalIndex: number, newTime: number): void {
	const tierIdx = get(selectedTierIndex);
	const currentTiers = get(tiers);

	if (tierIdx < 0 || tierIdx >= currentTiers.length) return;
	if (intervalIndex <= 0) return;

	const tier = currentTiers[tierIdx];
	const prev = tier.intervals[intervalIndex - 1];
	const current = tier.intervals[intervalIndex];

	// Check for snap target in upper tiers
	const snapTarget = findSnapTarget(newTime, tierIdx, currentTiers);
	const finalTime = snapTarget !== null ? snapTarget : newTime;

	// Ensure new time is within bounds
	if (finalTime <= prev.start || finalTime >= current.end) return;

	tiers.update(t => {
		const newTiers = [...t];
		const intervals = [...newTiers[tierIdx].intervals];

		intervals[intervalIndex - 1] = { ...intervals[intervalIndex - 1], end: finalTime };
		intervals[intervalIndex] = { ...intervals[intervalIndex], start: finalTime };

		newTiers[tierIdx] = { ...newTiers[tierIdx], intervals };
		return newTiers;
	});
}

/**
 * Clear all annotations.
 */
export function clearAnnotations(): void {
	saveUndo();
	tiers.set([]);
	selectedTierIndex.set(0);
	selectedIntervalIndex.set(null);
}

/**
 * Initialize with default empty tiers if no tiers exist.
 * Uses tier names from config.annotation.defaultTiers.
 */
export function initializeDefaultTier(): void {
	const currentTiers = get(tiers);
	if (currentTiers.length === 0) {
		const cfg = get(config);
		for (const tierName of cfg.annotation.defaultTiers) {
			addTier(tierName);
		}
	}
}
