import { writable, get } from 'svelte/store';
import { base } from '$app/paths';

/**
 * Whether the WASM module has been initialized.
 */
export const wasmReady = writable<boolean>(false);

// WASM module reference (typed as any since module is loaded dynamically)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasmModule: any = null;

/**
 * Initialize the WASM module. Call once at app startup.
 */
export async function initWasm(): Promise<void> {
	try {
		// Fetch and initialize WASM module (web build)
		// Use base path for portable deployment to subdirectories
		const wasmUrl = `${base}/pkg/praat_core_wasm.js`;
		const wasm = await import(/* @vite-ignore */ wasmUrl);
		await wasm.default();
		wasmModule = wasm;
		wasmReady.set(true);
		console.log('WASM acoustic analysis module initialized');
	} catch (e) {
		console.error('Failed to initialize WASM module:', e);
		throw e;
	}
}

/**
 * Get the WASM module. Throws if not initialized.
 */
export function getWasm() {
	if (!wasmModule) {
		throw new Error('WASM module not initialized. Call initWasm() first.');
	}
	return wasmModule;
}

/**
 * Create a Sound object from samples.
 * IMPORTANT: The caller is responsible for calling .free() when done.
 *
 * @param samples - Full-resolution audio samples (never downsampled)
 * @param sampleRate - Original sample rate
 */
export function createSound(samples: Float64Array, sampleRate: number) {
	const wasm = getWasm();
	return new wasm.Sound(samples, sampleRate);
}

/**
 * Compute all acoustic features for the given audio.
 * Returns an object with all analysis results.
 *
 * @param samples - Full-resolution audio samples
 * @param sampleRate - Original sample rate
 * @param options - Analysis parameters
 */
export async function computeAcoustics(
	samples: Float64Array,
	sampleRate: number,
	options: {
		timeStep?: number;
		pitchFloor?: number;
		pitchCeiling?: number;
		maxFormant?: number;
	} = {}
) {
	const {
		timeStep = 0.01,
		pitchFloor = 75,
		pitchCeiling = 600,
		maxFormant = 5500
	} = options;

	const wasm = getWasm();
	const sound = new wasm.Sound(samples, sampleRate);

	try {
		// Compute all analyses on full-resolution samples
		const pitch = sound.to_pitch(timeStep, pitchFloor, pitchCeiling);
		const intensity = sound.to_intensity(pitchFloor, timeStep);
		const formant = sound.to_formant_burg(timeStep, 5, maxFormant, 0.025, 50.0);
		const harmonicity = sound.to_harmonicity_ac(timeStep, pitchFloor, 0.1, 4.5);
		const spectrogram = sound.to_spectrogram(0.005, 5000, 0.005, 20.0, 'gaussian');

		// Extract values
		const times = Array.from(pitch.times());
		const pitchValues = Array.from(pitch.values());

		const result = {
			times,
			pitch: pitchValues,
			intensity: times.map(t => intensity.get_value_at_time(t, 'cubic')),
			formants: {
				f1: times.map(t => formant.get_value_at_time(1, t, 'hertz', 'linear')),
				f2: times.map(t => formant.get_value_at_time(2, t, 'hertz', 'linear')),
				f3: times.map(t => formant.get_value_at_time(3, t, 'hertz', 'linear')),
				f4: times.map(t => formant.get_value_at_time(4, t, 'hertz', 'linear')),
				b1: times.map(t => formant.get_bandwidth_at_time(1, t, 'hertz', 'linear')),
				b2: times.map(t => formant.get_bandwidth_at_time(2, t, 'hertz', 'linear')),
				b3: times.map(t => formant.get_bandwidth_at_time(3, t, 'hertz', 'linear')),
				b4: times.map(t => formant.get_bandwidth_at_time(4, t, 'hertz', 'linear')),
			},
			harmonicity: times.map(t => harmonicity.get_value_at_time(t, 'linear')),
			spectrogram: {
				values: spectrogram.values(),  // 2D array
				freqMin: spectrogram.freq_min(),
				freqMax: spectrogram.freq_max(),
				timeMin: spectrogram.time_min(),
				timeMax: spectrogram.time_max(),
				nFreqs: spectrogram.num_freqs(),
				nTimes: spectrogram.num_times(),
			}
		};

		// Free WASM objects
		pitch.free();
		intensity.free();
		formant.free();
		harmonicity.free();
		spectrogram.free();

		return result;
	} finally {
		sound.free();
	}
}
