import { writable, derived } from 'svelte/store';

/**
 * Visible time range in seconds.
 */
export const timeRange = writable<{ start: number; end: number }>({ start: 0, end: 5 });

/**
 * Current cursor position in seconds.
 */
export const cursorPosition = writable<number>(0);

/**
 * Selected region in seconds, or null if no selection.
 */
export const selection = writable<{ start: number; end: number } | null>(null);

/**
 * Whether the cursor is currently being dragged.
 */
export const isDragging = writable<boolean>(false);

/**
 * Hover position in seconds (for coordinated cursor across displays).
 * null when not hovering over any display.
 */
export const hoverPosition = writable<number | null>(null);

/**
 * Visible duration (derived).
 */
export const visibleDuration = derived(timeRange, ($timeRange) => $timeRange.end - $timeRange.start);
