import { writable, get } from 'svelte/store';
import { audioBuffer, sampleRate } from '$lib/stores/audio';
import { cursorPosition, selection, timeRange } from '$lib/stores/view';

/**
 * Playback state.
 */
export const isPlaying = writable<boolean>(false);

/**
 * Current playback mode.
 */
export const playbackMode = writable<'selection' | 'visible' | 'full'>('full');

// Audio context and source node
let audioContext: AudioContext | null = null;
let sourceNode: AudioBufferSourceNode | null = null;
let startTime = 0;
let startOffset = 0;
let endOffset = 0;
let animationFrameId: number | null = null;

/**
 * Initialize the audio context.
 */
function getAudioContext(): AudioContext {
	if (!audioContext) {
		audioContext = new AudioContext();
	}
	return audioContext;
}

/**
 * Play audio from the current cursor position to the end.
 */
export function play(): void {
	const buffer = get(audioBuffer);
	const sr = get(sampleRate);
	if (!buffer) return;

	const duration = buffer.length / sr;
	const cursor = get(cursorPosition);
	const sel = get(selection);
	const range = get(timeRange);

	let playStart: number;
	let playEnd: number;

	if (sel && sel.end > sel.start) {
		// Play selection
		playStart = sel.start;
		playEnd = sel.end;
		playbackMode.set('selection');
	} else {
		// Play from cursor to end of visible range
		playStart = cursor;
		playEnd = range.end;
		playbackMode.set('visible');
	}

	playRange(playStart, playEnd);
}

/**
 * Play a specific time range.
 */
export function playRange(start: number, end: number): void {
	stop();

	const buffer = get(audioBuffer);
	const sr = get(sampleRate);
	if (!buffer) return;

	const ctx = getAudioContext();

	// Create audio buffer from Float64Array
	const audioBufferNode = ctx.createBuffer(1, buffer.length, sr);
	const channelData = audioBufferNode.getChannelData(0);
	for (let i = 0; i < buffer.length; i++) {
		channelData[i] = buffer[i];
	}

	// Create source node
	sourceNode = ctx.createBufferSource();
	sourceNode.buffer = audioBufferNode;
	sourceNode.connect(ctx.destination);

	// Set up playback range
	startOffset = Math.max(0, start);
	endOffset = Math.min(buffer.length / sr, end);
	startTime = ctx.currentTime;

	// Start playback
	sourceNode.start(0, startOffset, endOffset - startOffset);
	isPlaying.set(true);

	// Handle playback end
	sourceNode.onended = () => {
		stop();
	};

	// Start cursor animation
	updateCursor();
}

/**
 * Play the visible window.
 */
export function playVisible(): void {
	const range = get(timeRange);
	playbackMode.set('visible');
	playRange(range.start, range.end);
}

/**
 * Play the entire file.
 */
export function playAll(): void {
	const buffer = get(audioBuffer);
	const sr = get(sampleRate);
	if (!buffer) return;

	playbackMode.set('full');
	playRange(0, buffer.length / sr);
}

/**
 * Pause playback.
 */
export function pause(): void {
	if (sourceNode) {
		sourceNode.stop();
		sourceNode.disconnect();
		sourceNode = null;
	}
	if (animationFrameId !== null) {
		cancelAnimationFrame(animationFrameId);
		animationFrameId = null;
	}
	isPlaying.set(false);
}

/**
 * Stop playback and reset cursor.
 */
export function stop(): void {
	pause();
	const sel = get(selection);
	if (sel) {
		cursorPosition.set(sel.start);
	}
}

/**
 * Toggle play/pause.
 */
export function togglePlayPause(): void {
	if (get(isPlaying)) {
		pause();
	} else {
		play();
	}
}

/**
 * Seek to a specific time.
 */
export function seek(time: number): void {
	const wasPlaying = get(isPlaying);
	if (wasPlaying) {
		pause();
	}
	cursorPosition.set(time);
	if (wasPlaying) {
		const sel = get(selection);
		if (sel && time >= sel.start && time < sel.end) {
			playRange(time, sel.end);
		} else {
			const range = get(timeRange);
			playRange(time, range.end);
		}
	}
}

/**
 * Update cursor position during playback.
 */
function updateCursor(): void {
	if (!get(isPlaying) || !audioContext) {
		return;
	}

	const elapsed = audioContext.currentTime - startTime;
	const currentTime = startOffset + elapsed;

	if (currentTime >= endOffset) {
		stop();
		return;
	}

	cursorPosition.set(currentTime);

	animationFrameId = requestAnimationFrame(updateCursor);
}
