/**
 * Unified Undo Manager
 *
 * Manages a single undo/redo stack for all application state changes,
 * including annotation tiers and data points. This ensures that undo
 * operations work correctly across all types of edits in the order
 * they were made.
 *
 * Architecture:
 * - Uses a state-snapshot approach: before each undoable operation,
 *   the entire relevant state (tiers + dataPoints) is captured.
 * - Both annotation changes and data point changes share the same stack,
 *   so Ctrl+Z undoes operations in chronological order regardless of type.
 * - Tier add/remove/rename operations are intentionally NOT undoable;
 *   users manage tiers explicitly.
 *
 * Undoable Operations:
 * - Adding/removing annotation boundaries
 * - Moving annotation boundaries
 * - Editing interval text labels
 * - Adding/removing/moving data points
 *
 * Non-Undoable Operations:
 * - Adding/removing/renaming tiers
 * - Loading audio files
 * - Loading TextGrid files
 *
 * Usage:
 * 1. Call initUndoManager(tiers, dataPoints) once at app startup
 * 2. Call saveUndo() before any undoable mutation
 * 3. Call undo()/redo() in response to Ctrl+Z/Ctrl+Y
 *
 * @module stores/undoManager
 */

import { writable, get } from 'svelte/store';
import type { Tier } from '$lib/types';
import type { DataPoint } from '$lib/types';

/**
 * A snapshot of the application state at a point in time.
 * Contains deep copies of both tiers and dataPoints.
 */
interface StateSnapshot {
	tiers: Tier[];
	dataPoints: DataPoint[];
}

/**
 * Maximum number of undo states to keep.
 * Older states are discarded when this limit is reached.
 */
const MAX_UNDO_STACK = 50;

/**
 * Undo stack - stores previous states.
 * Most recent state is at the end of the array.
 */
const undoStack = writable<StateSnapshot[]>([]);

/**
 * Redo stack - stores states that were undone.
 * Cleared when a new change is made.
 */
const redoStack = writable<StateSnapshot[]>([]);

/**
 * Reference to the tiers store from annotations.ts.
 * Set during initialization.
 */
let tiersStore: {
	set: (value: Tier[]) => void;
	subscribe: (fn: (value: Tier[]) => void) => () => void;
} | null = null;

/**
 * Reference to the dataPoints store from dataPoints.ts.
 * Set during initialization.
 */
let dataPointsStore: {
	set: (value: DataPoint[]) => void;
	subscribe: (fn: (value: DataPoint[]) => void) => () => void;
} | null = null;

/**
 * Get current tiers value from the store.
 * Uses subscribe/unsubscribe pattern to get synchronous value.
 *
 * @returns Current array of tiers
 */
function getTiers(): Tier[] {
	if (!tiersStore) return [];
	let value: Tier[] = [];
	const unsub = tiersStore.subscribe((v) => {
		value = v;
	});
	unsub();
	return value;
}

/**
 * Get current dataPoints value from the store.
 * Uses subscribe/unsubscribe pattern to get synchronous value.
 *
 * @returns Current array of data points
 */
function getDataPoints(): DataPoint[] {
	if (!dataPointsStore) return [];
	let value: DataPoint[] = [];
	const unsub = dataPointsStore.subscribe((v) => {
		value = v;
	});
	unsub();
	return value;
}

/**
 * Initialize the undo manager with references to the stores.
 * Must be called once at application startup before any undo operations.
 *
 * @param tiers - The tiers writable store from annotations.ts
 * @param dataPoints - The dataPoints writable store from dataPoints.ts
 *
 * @example
 * // In +page.svelte onMount:
 * import { tiers } from '$lib/stores/annotations';
 * import { dataPoints } from '$lib/stores/dataPoints';
 * import { initUndoManager } from '$lib/stores/undoManager';
 *
 * onMount(() => {
 *   initUndoManager(tiers, dataPoints);
 * });
 */
export function initUndoManager(
	tiers: typeof tiersStore,
	dataPoints: typeof dataPointsStore
): void {
	tiersStore = tiers;
	dataPointsStore = dataPoints;
}

/**
 * Save current state to undo stack before making changes.
 * Call this immediately before any mutation to tiers or dataPoints.
 *
 * The state is deep-cloned using JSON serialization to ensure
 * the snapshot is independent of future mutations.
 *
 * Note: This clears the redo stack, as making a new change
 * invalidates any previously undone states.
 *
 * @example
 * // In a store function that modifies state:
 * export function addBoundary(time: number): void {
 *   saveUndo();  // Save state BEFORE the change
 *   tiers.update(t => { ... });
 * }
 */
export function saveUndo(): void {
	const snapshot: StateSnapshot = {
		tiers: JSON.parse(JSON.stringify(getTiers())),
		dataPoints: JSON.parse(JSON.stringify(getDataPoints()))
	};

	undoStack.update((stack) => {
		const newStack = [...stack, snapshot];
		if (newStack.length > MAX_UNDO_STACK) newStack.shift();
		return newStack;
	});

	// Clear redo stack when new changes are made
	redoStack.set([]);
}

/**
 * Undo the last change, restoring both tiers and dataPoints.
 *
 * The current state is saved to the redo stack before restoring,
 * allowing the user to redo if needed.
 *
 * @returns true if undo was performed, false if undo stack was empty
 *
 * @example
 * // Handle Ctrl+Z:
 * if (e.ctrlKey && e.key === 'z') {
 *   undo();
 * }
 */
export function undo(): boolean {
	const stack = get(undoStack);
	if (stack.length === 0) return false;

	// Save current state to redo stack
	const currentSnapshot: StateSnapshot = {
		tiers: JSON.parse(JSON.stringify(getTiers())),
		dataPoints: JSON.parse(JSON.stringify(getDataPoints()))
	};
	redoStack.update((rs) => [...rs, currentSnapshot]);

	// Pop and restore previous state
	const prevState = stack[stack.length - 1];
	undoStack.update((s) => s.slice(0, -1));

	if (tiersStore) tiersStore.set(prevState.tiers);
	if (dataPointsStore) dataPointsStore.set(prevState.dataPoints);

	return true;
}

/**
 * Redo the last undone change.
 *
 * The current state is saved to the undo stack before restoring,
 * allowing the user to undo again if needed.
 *
 * @returns true if redo was performed, false if redo stack was empty
 *
 * @example
 * // Handle Ctrl+Y or Ctrl+Shift+Z:
 * if (e.ctrlKey && e.key === 'y') {
 *   redo();
 * }
 */
export function redo(): boolean {
	const stack = get(redoStack);
	if (stack.length === 0) return false;

	// Save current state to undo stack
	const currentSnapshot: StateSnapshot = {
		tiers: JSON.parse(JSON.stringify(getTiers())),
		dataPoints: JSON.parse(JSON.stringify(getDataPoints()))
	};
	undoStack.update((us) => [...us, currentSnapshot]);

	// Pop and restore next state
	const nextState = stack[stack.length - 1];
	redoStack.update((s) => s.slice(0, -1));

	if (tiersStore) tiersStore.set(nextState.tiers);
	if (dataPointsStore) dataPointsStore.set(nextState.dataPoints);

	return true;
}

/**
 * Clear both undo and redo stacks.
 * Call this when loading a new file to reset undo history.
 */
export function clearUndoHistory(): void {
	undoStack.set([]);
	redoStack.set([]);
}

/**
 * Check if undo is available.
 *
 * @returns true if there are states to undo
 */
export function canUndo(): boolean {
	return get(undoStack).length > 0;
}

/**
 * Check if redo is available.
 *
 * @returns true if there are states to redo
 */
export function canRedo(): boolean {
	return get(redoStack).length > 0;
}
