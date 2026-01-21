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

export interface GestureCallbacks {
	onPan: (deltaTime: number) => void;
	onZoom: (scale: number, centerTime: number) => void;
	onTap: (time: number) => void;
	onSelectionStart: (time: number) => void;
	onSelectionMove: (time: number) => void;
	onSelectionEnd: () => void;
	getTimeFromX: (x: number) => number;
	getVisibleDuration: () => number;
}

interface PointerState {
	id: number;
	x: number;
	y: number;
	startX: number;
	startY: number;
	startTime: number;
}

const TAP_THRESHOLD = 10; // pixels - movement less than this is a tap
const TAP_DURATION = 300; // ms - tap must be shorter than this

/**
 * Attach touch gesture handlers to an element.
 * Returns a cleanup function to remove event listeners.
 */
export function attachGestureHandlers(
	element: HTMLElement,
	callbacks: GestureCallbacks
): () => void {
	const activePointers: Map<number, PointerState> = new Map();
	let initialPinchDistance: number | null = null;
	let lastPanX: number | null = null;
	let isSelecting = false;

	function handlePointerDown(e: PointerEvent) {
		// Only handle touch events
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

	function handlePointerCancel(e: PointerEvent) {
		if (isSelecting) {
			isSelecting = false;
			callbacks.onSelectionEnd();
		}
		handlePointerUp(e);
	}

	// Prevent default touch behaviors
	function handleTouchStart(e: TouchEvent) {
		e.preventDefault();
	}

	// Add event listeners
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
