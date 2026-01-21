/**
 * Acoustic Analysis Store
 *
 * Manages acoustic analysis state and provides functions to compute
 * various acoustic features using the praatfan-core-wasm library.
 *
 * Computed features:
 * - Pitch (F0): Fundamental frequency using autocorrelation
 * - Formants (F1-F4): Vocal tract resonances via Burg's method
 * - Intensity: Sound pressure level in dB
 * - Harmonicity (HNR): Harmonics-to-noise ratio for voice quality
 * - Spectrogram: Time-frequency power distribution
 * - Center of Gravity (CoG): Spectral centroid indicating brightness
 * - Spectral Tilt: Low vs high frequency energy balance
 * - A1-P0: Nasality measure comparing F0 and nasal pole amplitudes
 *
 * @module stores/analysis
 */

import { writable, derived, get } from 'svelte/store';
import { audioBuffer, sampleRate } from './audio';
import { createSound, getWasm, wasmReady } from '$lib/wasm/acoustic';
import { getCurrentPreset } from './config';
import type { AnalysisResults, SpectrogramData } from '$lib/types';

/**
 * Whether analysis is currently in progress.
 */
export const isAnalyzing = writable<boolean>(false);

/**
 * Analysis progress (0-100).
 */
export const analysisProgress = writable<number>(0);

/**
 * Cached analysis results.
 */
export const analysisResults = writable<AnalysisResults | null>(null);

/**
 * Analysis parameters.
 */
export const analysisParams = writable({
	timeStep: 0.01,
	pitchFloor: 75,
	pitchCeiling: 600,
	maxFormant: 5500,
	numFormants: 5
});

/**
 * Run full acoustic analysis on loaded audio.
 */
export async function runAnalysis(): Promise<void> {
	const buffer = get(audioBuffer);
	const sr = get(sampleRate);
	const ready = get(wasmReady);

	if (!buffer || !ready) {
		console.warn('Cannot run analysis: audio or WASM not ready');
		return;
	}

	isAnalyzing.set(true);
	analysisProgress.set(0);

	try {
		const params = get(analysisParams);
		const preset = getCurrentPreset();
		const wasm = getWasm();
		const sound = new wasm.Sound(buffer, sr);

		try {
			// Pitch analysis
			analysisProgress.set(10);
			const pitch = sound.to_pitch(params.timeStep, params.pitchFloor, params.pitchCeiling);

			// Intensity analysis
			analysisProgress.set(25);
			const intensity = sound.to_intensity(params.pitchFloor, params.timeStep);

			// Formant analysis - use preset's maxFormant for voice type
			analysisProgress.set(40);
			const formant = sound.to_formant_burg(
				params.timeStep,
				params.numFormants,
				preset.maxFormant,
				0.025,
				50.0
			);

			// Harmonicity analysis
			analysisProgress.set(55);
			const harmonicity = sound.to_harmonicity_cc(params.timeStep, params.pitchFloor, 0.1, 1.0);

			// Spectrogram
			analysisProgress.set(70);
			const spectrogram = sound.to_spectrogram(0.005, 5000, 0.002, 20.0, 'gaussian');

			// Extract values
			analysisProgress.set(80);
			const times: number[] = Array.from(pitch.times() as Float64Array);
			const pitchValues: number[] = Array.from(pitch.values() as Float64Array);

			// Compute spectral measures (CoG, Spectral Tilt, A1-P0)
			analysisProgress.set(85);
			const spectralMeasures = computeSpectralMeasures(buffer, sr, times, pitchValues, wasm);

			analysisProgress.set(95);
			const results: AnalysisResults = {
				times,
				pitch: pitchValues.map((v: number) => (isNaN(v) || v === 0 ? null : v)),
				intensity: times.map((t: number) => {
					const v = intensity.get_value_at_time(t, 'cubic');
					return isNaN(v) ? null : v;
				}),
				formants: {
					f1: times.map(t => nullIfNaN(formant.get_value_at_time(1, t, 'hertz', 'linear'))),
					f2: times.map(t => nullIfNaN(formant.get_value_at_time(2, t, 'hertz', 'linear'))),
					f3: times.map(t => nullIfNaN(formant.get_value_at_time(3, t, 'hertz', 'linear'))),
					f4: times.map(t => nullIfNaN(formant.get_value_at_time(4, t, 'hertz', 'linear'))),
					b1: times.map(t => nullIfNaN(formant.get_bandwidth_at_time(1, t, 'hertz', 'linear'))),
					b2: times.map(t => nullIfNaN(formant.get_bandwidth_at_time(2, t, 'hertz', 'linear'))),
					b3: times.map(t => nullIfNaN(formant.get_bandwidth_at_time(3, t, 'hertz', 'linear'))),
					b4: times.map(t => nullIfNaN(formant.get_bandwidth_at_time(4, t, 'hertz', 'linear')))
				},
				harmonicity: times.map(t => nullIfNaN(harmonicity.get_value_at_time(t, 'linear'))),
				cog: spectralMeasures.cog,
				spectralTilt: spectralMeasures.spectralTilt,
				a1p0: spectralMeasures.a1p0,
				spectrogram: {
					values: spectrogram.values(),
					freqMin: spectrogram.freq_min,
					freqMax: spectrogram.freq_max,
					timeMin: spectrogram.start_time,
					timeMax: spectrogram.start_time + (spectrogram.num_frames - 1) * spectrogram.time_step,
					nFreqs: spectrogram.num_freq_bins,
					nTimes: spectrogram.num_frames
				}
			};

			// Free WASM objects
			pitch.free();
			intensity.free();
			formant.free();
			harmonicity.free();
			spectrogram.free();

			analysisProgress.set(100);
			analysisResults.set(results);
		} finally {
			sound.free();
		}
	} catch (e) {
		console.error('Analysis failed:', e);
		throw e;
	} finally {
		isAnalyzing.set(false);
	}
}

function nullIfNaN(v: number): number | null {
	return isNaN(v) || v === 0 ? null : v;
}

/**
 * Compute spectral measures for each time frame.
 * CoG: Center of Gravity (spectral centroid)
 * Spectral Tilt: Slope of the spectrum in dB/octave (computed via band energies)
 * A1-P0: Amplitude difference between F1 region and F0 (nasality measure)
 */
function computeSpectralMeasures(
	buffer: Float64Array,
	sr: number,
	times: number[],
	pitchValues: number[],
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	wasm: any
): { cog: (number | null)[]; spectralTilt: (number | null)[]; a1p0: (number | null)[] } {
	const windowDuration = 0.025; // 25ms window
	const halfWindow = windowDuration / 2;
	const windowSamples = Math.floor(windowDuration * sr);

	const cog: (number | null)[] = [];
	const spectralTilt: (number | null)[] = [];
	const a1p0: (number | null)[] = [];

	for (let i = 0; i < times.length; i++) {
		const t = times[i];
		const f0 = pitchValues[i];

		// Extract window around time point
		const startSample = Math.max(0, Math.floor((t - halfWindow) * sr));
		const endSample = Math.min(buffer.length, startSample + windowSamples);

		if (endSample - startSample < windowSamples / 2) {
			cog.push(null);
			spectralTilt.push(null);
			a1p0.push(null);
			continue;
		}

		try {
			// Create a short sound segment
			const segment = buffer.slice(startSample, endSample);
			const segmentSound = new wasm.Sound(segment, sr);

			// Get spectrum (fast=true for power-of-2 FFT)
			const spectrum = segmentSound.to_spectrum(true);

			// Compute Center of Gravity (power = 2 for standard CoG)
			const cogValue = spectrum.get_center_of_gravity(2.0);
			cog.push(isNaN(cogValue) || cogValue <= 0 ? null : cogValue);

			// Compute Spectral Tilt: low freq (0-500 Hz) vs high freq (2000-4000 Hz) in dB
			// Same as Ozen Python implementation
			const bandLow = spectrum.get_band_energy(0, 500);
			const bandHigh = spectrum.get_band_energy(2000, 4000);

			if (bandLow > 0 && bandHigh > 0) {
				const tiltValue = 10 * Math.log10(bandLow) - 10 * Math.log10(bandHigh);
				spectralTilt.push(isNaN(tiltValue) ? null : tiltValue);
			} else {
				spectralTilt.push(null);
			}

			// Compute A1-P0 nasal ratio: amplitude at F0 minus nasal pole amplitude
			// A1 is at F0 frequency (first harmonic), P0 is in the ~250 Hz nasal region
			// Same as Ozen Python implementation
			if (f0 && !isNaN(f0) && f0 > 0) {
				// Get amplitude at F0 (A1 - first harmonic) with ±10% bandwidth
				const a1Amp = spectrum.get_band_energy(f0 * 0.9, f0 * 1.1);
				// Get amplitude at nasal pole region (around 250 Hz, typical P0 region)
				const p0Amp = spectrum.get_band_energy(200, 300);

				if (a1Amp > 0 && p0Amp > 0) {
					const a1p0Value = 10 * Math.log10(a1Amp) - 10 * Math.log10(p0Amp);
					a1p0.push(isNaN(a1p0Value) ? null : a1p0Value);
				} else {
					a1p0.push(null);
				}
			} else {
				a1p0.push(null);
			}

			spectrum.free();
			segmentSound.free();
		} catch (e) {
			// If spectrum computation fails, push nulls
			cog.push(null);
			spectralTilt.push(null);
			a1p0.push(null);
		}
	}

	return { cog, spectralTilt, a1p0 };
}

/**
 * Clear analysis results (e.g., when loading new audio).
 */
export function clearAnalysis(): void {
	analysisResults.set(null);
	analysisProgress.set(0);
}
