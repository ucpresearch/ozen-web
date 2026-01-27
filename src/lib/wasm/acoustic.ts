import { writable, get } from 'svelte/store';
import { base } from '$app/paths';
import type { AcousticBackend } from '$lib/stores/config';

/**
 * Whether the WASM module has been initialized.
 */
export const wasmReady = writable<boolean>(false);

/**
 * Current backend that is loaded.
 */
export const currentBackend = writable<AcousticBackend | null>(null);

// WASM module reference (typed as any since module is loaded dynamically)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasmModule: any = null;

// WASM module URLs for each backend (remote backends)
const REMOTE_BACKEND_URLS: Record<string, string> = {
	'praatfan-gpl': 'https://ucpresearch.github.io/praatfan-core-rs/pkg/praatfan_gpl.js',
	'praatfan': 'https://ucpresearch.github.io/praatfan-core-clean/pkg/praatfan.js'
};

/**
 * Get the URL for a backend. Local backend uses SvelteKit's base path.
 */
function getBackendUrl(backend: AcousticBackend): string {
	if (backend === 'praatfan-local') {
		// Use SvelteKit's base path for subdirectory deployments
		return `${base}/wasm/praatfan/praatfan.js`;
	}
	return REMOTE_BACKEND_URLS[backend];
}

// Map backend to its "type" for API compatibility
const BACKEND_TYPE: Record<AcousticBackend, 'praatfan-gpl' | 'praatfan'> = {
	'praatfan-gpl': 'praatfan-gpl',
	'praatfan': 'praatfan',
	'praatfan-local': 'praatfan'  // local uses same API as praatfan
};

/**
 * Initialize the WASM module for a specific backend.
 * If already initialized with a different backend, will reload.
 */
export async function initWasm(backend: AcousticBackend = 'praatfan-gpl'): Promise<void> {
	const current = get(currentBackend);

	// If same backend is already loaded, do nothing
	if (current === backend && wasmModule) {
		return;
	}

	// Mark as not ready during reload
	wasmReady.set(false);
	wasmModule = null;

	try {
		const url = getBackendUrl(backend);
		console.log(`Loading WASM module from ${url}...`);

		// Load WASM module from GitHub Pages CDN
		const wasm = await import(/* @vite-ignore */ url);
		await wasm.default();

		// praatfan (clean) has an init() function that must be called
		if ((backend === 'praatfan' || backend === 'praatfan-local') && typeof wasm.init === 'function') {
			wasm.init();
		}

		wasmModule = wasm;
		currentBackend.set(backend);
		wasmReady.set(true);
		console.log(`WASM acoustic analysis module initialized (${backend})`);
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
 * Get the currently loaded backend.
 */
export function getBackend(): AcousticBackend {
	const backend = get(currentBackend);
	if (!backend) {
		throw new Error('No backend loaded. Call initWasm() first.');
	}
	return backend;
}

/**
 * Get the backend type for API compatibility.
 * praatfan-local uses the same API as praatfan.
 */
export function getBackendType(): 'praatfan-gpl' | 'praatfan' {
	const backend = getBackend();
	return BACKEND_TYPE[backend];
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
 * Abstraction layer for Pitch analysis.
 * Handles API differences between backends.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computePitch(sound: any, timeStep: number, pitchFloor: number, pitchCeiling: number) {
	const backend = getBackendType();

	if (backend === 'praatfan-gpl') {
		// praatfan-gpl uses to_pitch()
		return sound.to_pitch(timeStep, pitchFloor, pitchCeiling);
	} else {
		// praatfan uses to_pitch_ac()
		return sound.to_pitch_ac(timeStep, pitchFloor, pitchCeiling);
	}
}

/**
 * Abstraction layer for Intensity analysis.
 * Both backends have the same API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeIntensity(sound: any, minPitch: number, timeStep: number) {
	return sound.to_intensity(minPitch, timeStep);
}

/**
 * Abstraction layer for Formant analysis.
 * Both backends have the same to_formant_burg() API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeFormant(sound: any, timeStep: number, numFormants: number, maxFormant: number, windowLength: number, preEmphasis: number) {
	return sound.to_formant_burg(timeStep, numFormants, maxFormant, windowLength, preEmphasis);
}

/**
 * Abstraction layer for Harmonicity analysis.
 * Both backends have the same to_harmonicity_ac() API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeHarmonicity(sound: any, timeStep: number, minPitch: number, silenceThreshold: number, periodsPerWindow: number) {
	return sound.to_harmonicity_ac(timeStep, minPitch, silenceThreshold, periodsPerWindow);
}

/**
 * Abstraction layer for Spectrogram analysis.
 * Handles API differences between backends.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeSpectrogram(sound: any, windowLength: number, maxFrequency: number, timeStep: number, freqStep: number) {
	const backend = getBackendType();

	if (backend === 'praatfan-gpl') {
		// praatfan-gpl has window shape parameter
		return sound.to_spectrogram(windowLength, maxFrequency, timeStep, freqStep, 'gaussian');
	} else {
		// praatfan doesn't have window shape parameter
		return sound.to_spectrogram(windowLength, maxFrequency, timeStep, freqStep);
	}
}

/**
 * Abstraction layer for Spectrum analysis.
 * Both backends have the same to_spectrum() API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeSpectrum(sound: any, fast: boolean) {
	return sound.to_spectrum(fast);
}

/**
 * Get pitch times array.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPitchTimes(pitch: any): Float64Array {
	return pitch.times();
}

/**
 * Get pitch values array.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPitchValues(pitch: any): Float64Array {
	return pitch.values();
}

/**
 * Get intensity value at a specific time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getIntensityAtTime(intensity: any, time: number): number {
	const backend = getBackendType();

	if (backend === 'praatfan-gpl') {
		// praatfan-gpl has get_value_at_time with interpolation
		return intensity.get_value_at_time(time, 'cubic');
	} else {
		// praatfan uses frame-based access, find nearest frame
		const times = intensity.times() as Float64Array;
		const values = intensity.values() as Float64Array;
		return interpolateAtTime(times, values, time);
	}
}

/**
 * Get all intensity values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getIntensityValues(intensity: any): Float64Array {
	return intensity.values();
}

/**
 * Get intensity times.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getIntensityTimes(intensity: any): Float64Array {
	return intensity.times();
}

/**
 * Get formant value at a specific time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFormantAtTime(formant: any, formantNum: number, time: number): number {
	const backend = getBackendType();

	if (backend === 'praatfan-gpl') {
		// praatfan-gpl has get_value_at_time
		return formant.get_value_at_time(formantNum, time, 'hertz', 'linear');
	} else {
		// praatfan uses formant_values() arrays
		const times = formant.times() as Float64Array;
		const values = formant.formant_values(formantNum) as Float64Array;
		return interpolateAtTime(times, values, time);
	}
}

/**
 * Get formant bandwidth at a specific time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getBandwidthAtTime(formant: any, formantNum: number, time: number): number {
	const backend = getBackendType();

	if (backend === 'praatfan-gpl') {
		// praatfan-gpl has get_bandwidth_at_time
		return formant.get_bandwidth_at_time(formantNum, time, 'hertz', 'linear');
	} else {
		// praatfan uses bandwidth_values() arrays
		const times = formant.times() as Float64Array;
		const values = formant.bandwidth_values(formantNum) as Float64Array;
		return interpolateAtTime(times, values, time);
	}
}

/**
 * Get harmonicity value at a specific time.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getHarmonicityAtTime(harmonicity: any, time: number): number {
	const backend = getBackendType();

	if (backend === 'praatfan-gpl') {
		// praatfan-gpl has get_value_at_time
		return harmonicity.get_value_at_time(time, 'linear');
	} else {
		// praatfan uses values() array
		const times = harmonicity.times() as Float64Array;
		const values = harmonicity.values() as Float64Array;
		return interpolateAtTime(times, values, time);
	}
}

/**
 * Get spectrogram metadata.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSpectrogramInfo(spectrogram: any): {
	values: Float64Array;
	freqMin: number;
	freqMax: number;
	timeMin: number;
	timeMax: number;
	nFreqs: number;
	nTimes: number;
} {
	const backend = getBackendType();

	if (backend === 'praatfan-gpl') {
		// praatfan-gpl has properties
		return {
			values: spectrogram.values(),
			freqMin: spectrogram.freq_min,
			freqMax: spectrogram.freq_max,
			timeMin: spectrogram.start_time,
			timeMax: spectrogram.start_time + (spectrogram.num_frames - 1) * spectrogram.time_step,
			nFreqs: spectrogram.num_freq_bins,
			nTimes: spectrogram.num_frames
		};
	} else {
		// praatfan has methods
		return {
			values: spectrogram.values(),
			freqMin: spectrogram.freq_min(),
			freqMax: spectrogram.freq_max(),
			timeMin: spectrogram.time_min(),
			timeMax: spectrogram.time_max(),
			nFreqs: spectrogram.n_freqs(),
			nTimes: spectrogram.n_times()
		};
	}
}

/**
 * Helper function to linearly interpolate a value at a given time.
 */
function interpolateAtTime(times: Float64Array, values: Float64Array, time: number): number {
	if (times.length === 0) return NaN;
	if (times.length === 1) return values[0];

	// Find the frame index
	const timeStep = times.length > 1 ? times[1] - times[0] : 1;
	const startTime = times[0];

	// Compute fractional frame index
	const frameIndex = (time - startTime) / timeStep;

	// Boundary checks
	if (frameIndex <= 0) return values[0];
	if (frameIndex >= times.length - 1) return values[times.length - 1];

	// Linear interpolation
	const i0 = Math.floor(frameIndex);
	const i1 = i0 + 1;
	const frac = frameIndex - i0;

	const v0 = values[i0];
	const v1 = values[i1];

	// Handle NaN values
	if (isNaN(v0) && isNaN(v1)) return NaN;
	if (isNaN(v0)) return v1;
	if (isNaN(v1)) return v0;

	return v0 + frac * (v1 - v0);
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
		const pitch = computePitch(sound, timeStep, pitchFloor, pitchCeiling);
		const intensity = computeIntensity(sound, pitchFloor, timeStep);
		const formant = computeFormant(sound, timeStep, 5, maxFormant, 0.025, 50.0);
		const harmonicity = computeHarmonicity(sound, timeStep, pitchFloor, 0.1, 4.5);
		const spectrogram = computeSpectrogram(sound, 0.005, 5000, 0.005, 20.0);

		// Extract values using abstraction layer
		const times = Array.from(getPitchTimes(pitch));
		const pitchValues = Array.from(getPitchValues(pitch));
		const spectrogramInfo = getSpectrogramInfo(spectrogram);

		const result = {
			times,
			pitch: pitchValues,
			intensity: times.map(t => getIntensityAtTime(intensity, t)),
			formants: {
				f1: times.map(t => getFormantAtTime(formant, 1, t)),
				f2: times.map(t => getFormantAtTime(formant, 2, t)),
				f3: times.map(t => getFormantAtTime(formant, 3, t)),
				f4: times.map(t => getFormantAtTime(formant, 4, t)),
				b1: times.map(t => getBandwidthAtTime(formant, 1, t)),
				b2: times.map(t => getBandwidthAtTime(formant, 2, t)),
				b3: times.map(t => getBandwidthAtTime(formant, 3, t)),
				b4: times.map(t => getBandwidthAtTime(formant, 4, t)),
			},
			harmonicity: times.map(t => getHarmonicityAtTime(harmonicity, t)),
			spectrogram: spectrogramInfo
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
