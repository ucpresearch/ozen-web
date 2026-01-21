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
 * Undo stack for annotation changes.
 */
const undoStack = writable<Tier[][]>([]);
const redoStack = writable<Tier[][]>([]);

/**
 * Save current state to undo stack.
 */
function saveUndo() {
	const currentTiers = get(tiers);
	undoStack.update(stack => {
		const newStack = [...stack, JSON.parse(JSON.stringify(currentTiers))];
		// Limit undo stack size
		if (newStack.length > 50) newStack.shift();
		return newStack;
	});
	redoStack.set([]);
}

/**
 * Undo last change.
 */
export function undo() {
	const stack = get(undoStack);
	if (stack.length === 0) return;

	const currentTiers = get(tiers);
	redoStack.update(rs => [...rs, JSON.parse(JSON.stringify(currentTiers))]);

	const prevState = stack[stack.length - 1];
	undoStack.update(s => s.slice(0, -1));
	tiers.set(prevState);
}

/**
 * Redo last undone change.
 */
export function redo() {
	const stack = get(redoStack);
	if (stack.length === 0) return;

	const currentTiers = get(tiers);
	undoStack.update(us => [...us, JSON.parse(JSON.stringify(currentTiers))]);

	const nextState = stack[stack.length - 1];
	redoStack.update(s => s.slice(0, -1));
	tiers.set(nextState);
}

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
 */
export function addTier(name: string, type: 'interval' | 'point' = 'interval'): void {
	saveUndo();
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
 */
export function removeTier(index: number): void {
	saveUndo();
	tiers.update(t => t.filter((_, i) => i !== index));
	const idx = get(selectedTierIndex);
	if (idx >= index && idx > 0) {
		selectedTierIndex.update(i => i - 1);
	}
}

/**
 * Rename a tier.
 */
export function renameTier(index: number, newName: string): void {
	saveUndo();
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

	saveUndo();

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
 * Initialize with a default empty tier if no tiers exist.
 */
export function initializeDefaultTier(): void {
	const currentTiers = get(tiers);
	if (currentTiers.length === 0) {
		addTier('Tier 1');
	}
}
