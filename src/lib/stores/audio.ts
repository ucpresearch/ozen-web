import { writable } from 'svelte/store';

/**
 * Raw audio samples at full resolution.
 * All analysis is performed on these original samples - never downsampled.
 */
export const audioBuffer = writable<Float64Array | null>(null);

/**
 * Original sample rate of the loaded audio.
 */
export const sampleRate = writable<number>(44100);

/**
 * Name of the loaded file.
 */
export const fileName = writable<string>('');

/**
 * Duration in seconds (derived from audioBuffer and sampleRate).
 */
export const duration = writable<number>(0);
