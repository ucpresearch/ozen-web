/**
 * Touch Gesture Handler
 *
 * Provides touch gesture support for mobile viewer:
 * - Single finger: tap to position cursor, drag to select region
 * - Two fingers: pan (drag) and pinch-to-zoom
 *
 * Uses Pointer Events API for cross-browser compatibility.
 *
 * @module touch/gestures
 */

/**
 * Callbacks provided by the consumer to handle gesture events.
 * All time values are in seconds relative to the audio timeline.
 */
export interface GestureCallbacks {
	/** Called during two-finger drag. deltaTime is the time shift to apply. */
	onPan: (deltaTime: number) => void;
	/** Called during pinch. scale > 1 means zoom in, centerTime is the zoom focus. */
	onZoom: (scale: number, centerTime: number) => void;
	/** Called on single-finger tap. Positions cursor at the given time. */
	onTap: (time: number) => void;
	/** Called when drag-to-select begins. */
	onSelectionStart: (time: number) => void;
	/** Called during drag-to-select with current position. */
	onSelectionMove: (time: number) => void;
	/** Called when drag-to-select ends. */
	onSelectionEnd: () => void;
	/** Convert screen X coordinate (clientX) to time in seconds. */
	getTimeFromX: (x: number) => number;
	/** Get the currently visible time duration in seconds. */
	getVisibleDuration: () => number;
}

/**
 * Internal state tracking for each active touch pointer.
 * Tracks both current position and start position to distinguish taps from drags.
 */
interface PointerState {
	/** Unique pointer ID from PointerEvent */
	id: number;
	/** Current X position (updated on move) */
	x: number;
	/** Current Y position (updated on move) */
	y: number;
	/** X position when touch started */
	startX: number;
	/** Y position when touch started */
	startY: number;
	/** Timestamp (ms) when touch started */
	startTime: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tap Detection Constants
// A gesture is a "tap" if movement is minimal and duration is short
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum movement (pixels) for a gesture to be considered a tap */
const TAP_THRESHOLD = 10;
/** Maximum duration (ms) for a gesture to be considered a tap */
const TAP_DURATION = 300;

/**
 * Attach touch gesture handlers to an element.
 *
 * Gesture recognition:
 * - 1 finger + minimal movement + short duration = tap (cursor position)
 * - 1 finger + drag = selection
 * - 2 fingers + drag = pan (shift visible time range)
 * - 2 fingers + pinch = zoom (change visible duration)
 *
 * Uses pointer capture to ensure we receive all events even if pointer
 * moves outside the element boundaries.
 *
 * @param element - The DOM element to attach gesture handlers to
 * @param callbacks - Callback functions for handling gesture events
 * @returns Cleanup function to remove all event listeners
 */
export function attachGestureHandlers(
	element: HTMLElement,
	callbacks: GestureCallbacks
): () => void {
	// Track all active touch pointers (supports multi-touch)
	const activePointers: Map<number, PointerState> = new Map();

	// State for two-finger gestures
	let initialPinchDistance: number | null = null;
	let lastPanX: number | null = null;

	// State for single-finger selection
	let isSelecting = false;

	/**
	 * Handle pointer down (touch start).
	 * Captures the pointer and initializes tracking state.
	 */
	function handlePointerDown(e: PointerEvent) {
		// Only handle touch events (ignore mouse/pen)
		if (e.pointerType !== 'touch') return;

		element.setPointerCapture(e.pointerId);
		activePointers.set(e.pointerId, {
			id: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			startX: e.clientX,
			startY: e.clientY,
			startTime: Date.now()
		});

		// Two fingers: initialize pan state
		if (activePointers.size === 2) {
			const pointers = Array.from(activePointers.values());
			initialPinchDistance = getDistance(pointers[0], pointers[1]);
			const centerX = (pointers[0].x + pointers[1].x) / 2;
			lastPanX = centerX;
			// Cancel any selection in progress
			if (isSelecting) {
				isSelecting = false;
				callbacks.onSelectionEnd();
			}
		}
	}

	/**
	 * Handle pointer move (touch move).
	 * Processes pan, zoom, or selection based on number of active pointers.
	 */
	function handlePointerMove(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;

		const pointer = activePointers.get(e.pointerId);
		if (!pointer) return;

		// Update pointer position
		pointer.x = e.clientX;
		pointer.y = e.clientY;

		if (activePointers.size === 2) {
			// Two fingers: pan and/or zoom
			const pointers = Array.from(activePointers.values());

			// Handle pinch zoom
			if (initialPinchDistance !== null) {
				const currentDistance = getDistance(pointers[0], pointers[1]);
				const scale = currentDistance / initialPinchDistance;

				if (Math.abs(scale - 1) > 0.02) { // Only zoom if significant change
					const centerX = (pointers[0].x + pointers[1].x) / 2;
					const centerTime = callbacks.getTimeFromX(centerX);
					callbacks.onZoom(scale, centerTime);
					initialPinchDistance = currentDistance;
				}
			}

			// Handle two-finger pan
			if (lastPanX !== null) {
				const centerX = (pointers[0].x + pointers[1].x) / 2;
				const deltaX = centerX - lastPanX;
				if (Math.abs(deltaX) > 2) {
					const rect = element.getBoundingClientRect();
					const visibleDuration = callbacks.getVisibleDuration();
					const deltaTime = (deltaX / rect.width) * visibleDuration;
					callbacks.onPan(-deltaTime);
					lastPanX = centerX;
				}
			}
		} else if (activePointers.size === 1) {
			// Single finger: check if we should start/continue selection
			const dx = pointer.x - pointer.startX;
			const dy = pointer.y - pointer.startY;
			const distance = Math.sqrt(dx * dx + dy * dy);

			if (!isSelecting && distance > TAP_THRESHOLD) {
				// Started dragging - begin selection
				isSelecting = true;
				const startTime = callbacks.getTimeFromX(pointer.startX);
				callbacks.onSelectionStart(startTime);
			}

			if (isSelecting) {
				const time = callbacks.getTimeFromX(pointer.x);
				callbacks.onSelectionMove(time);
			}
		}
	}

	/**
	 * Handle pointer up (touch end).
	 * Determines if this was a tap or selection, cleans up state.
	 */
	function handlePointerUp(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;

		const pointer = activePointers.get(e.pointerId);

		if (pointer && activePointers.size === 1) {
			// Check if this was a tap (short duration, minimal movement)
			const dx = pointer.x - pointer.startX;
			const dy = pointer.y - pointer.startY;
			const distance = Math.sqrt(dx * dx + dy * dy);
			const duration = Date.now() - pointer.startTime;

			if (distance < TAP_THRESHOLD && duration < TAP_DURATION) {
				// It's a tap - position cursor
				const time = callbacks.getTimeFromX(pointer.x);
				callbacks.onTap(time);
			} else if (isSelecting) {
				// End selection
				callbacks.onSelectionEnd();
			}
			isSelecting = false;
		}

		element.releasePointerCapture(e.pointerId);
		activePointers.delete(e.pointerId);

		// Reset state based on remaining pointers
		if (activePointers.size === 0) {
			initialPinchDistance = null;
			lastPanX = null;
		} else if (activePointers.size === 1) {
			// Transition from two fingers to one - reset pan/zoom state
			initialPinchDistance = null;
			lastPanX = null;
		}
	}

	/**
	 * Handle pointer cancel (interrupted touch, e.g., by system gesture).
	 * Cleans up any in-progress selection and delegates to pointerup handler.
	 */
	function handlePointerCancel(e: PointerEvent) {
		if (isSelecting) {
			isSelecting = false;
			callbacks.onSelectionEnd();
		}
		handlePointerUp(e);
	}

	/**
	 * Prevent default touch behaviors (scroll, zoom, refresh).
	 * Must use { passive: false } to allow preventDefault().
	 */
	function handleTouchStart(e: TouchEvent) {
		e.preventDefault();
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Event Listener Setup
	// ─────────────────────────────────────────────────────────────────────────
	element.addEventListener('pointerdown', handlePointerDown);
	element.addEventListener('pointermove', handlePointerMove);
	element.addEventListener('pointerup', handlePointerUp);
	element.addEventListener('pointercancel', handlePointerCancel);
	element.addEventListener('touchstart', handleTouchStart, { passive: false });

	// Return cleanup function
	return () => {
		element.removeEventListener('pointerdown', handlePointerDown);
		element.removeEventListener('pointermove', handlePointerMove);
		element.removeEventListener('pointerup', handlePointerUp);
		element.removeEventListener('pointercancel', handlePointerCancel);
		element.removeEventListener('touchstart', handleTouchStart);
	};
}

/**
 * Calculate distance between two pointers.
 */
function getDistance(p1: PointerState, p2: PointerState): number {
	const dx = p1.x - p2.x;
	const dy = p1.y - p2.y;
	return Math.hypot(dx, dy);
}
