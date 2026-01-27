/**
 * Acoustic Analysis Store
 *
 * Manages acoustic analysis state and provides functions to compute
 * various acoustic features using the praatfan WASM libraries.
 *
 * Supports two backends:
 * - praatfan-gpl: Full Praat reimplementation (GPL)
 * - praatfan: Clean-room implementation (MIT/Apache)
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
import { audioBuffer, sampleRate, duration } from './audio';
import {
	createSound,
	getWasm,
	wasmReady,
	computePitch,
	computeIntensity,
	computeFormant,
	computeHarmonicity,
	computeSpectrogram,
	computeSpectrum,
	getPitchTimes,
	getPitchValues,
	getIntensityAtTime,
	getFormantAtTime,
	getBandwidthAtTime,
	getHarmonicityAtTime,
	getSpectrogramInfo
} from '$lib/wasm/acoustic';
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
			const pitch = computePitch(sound, params.timeStep, params.pitchFloor, params.pitchCeiling);

			// Intensity analysis
			analysisProgress.set(25);
			const intensity = computeIntensity(sound, params.pitchFloor, params.timeStep);

			// Formant analysis - use preset's maxFormant for voice type
			analysisProgress.set(40);
			const formant = computeFormant(
				sound,
				params.timeStep,
				params.numFormants,
				preset.maxFormant,
				0.025,
				50.0
			);

			// Harmonicity analysis
			analysisProgress.set(55);
			const harmonicity = computeHarmonicity(sound, params.timeStep, params.pitchFloor, 0.1, 4.5);

			// Extract values using abstraction layer
			analysisProgress.set(70);
			const times: number[] = Array.from(getPitchTimes(pitch));
			const pitchValues: number[] = Array.from(getPitchValues(pitch));

			// Skip spectrogram and spectral measures for long audio (>60s)
			const audioDuration = get(duration);
			const isLongAudio = audioDuration > 60;

			let spectrogram = null;
			let spectrogramInfo = null;
			let spectralMeasures = { cog: null, spectralTilt: null, a1p0: null };

			if (!isLongAudio) {
				// Spectrogram
				analysisProgress.set(75);
				spectrogram = computeSpectrogram(sound, 0.005, 5000, 0.002, 20.0);

				// Compute spectral measures (CoG, Spectral Tilt, A1-P0)
				analysisProgress.set(85);
				spectralMeasures = computeSpectralMeasures(buffer, sr, times, pitchValues, wasm);

				// Get spectrogram info
				spectrogramInfo = getSpectrogramInfo(spectrogram);
			} else {
				analysisProgress.set(85);
			}

			analysisProgress.set(95);
			const results: AnalysisResults = {
				times,
				pitch: pitchValues.map((v: number) => (isNaN(v) || v === 0 ? null : v)),
				intensity: times.map((t: number) => {
					const v = getIntensityAtTime(intensity, t);
					return isNaN(v) ? null : v;
				}),
				formants: {
					f1: times.map(t => nullIfNaN(getFormantAtTime(formant, 1, t))),
					f2: times.map(t => nullIfNaN(getFormantAtTime(formant, 2, t))),
					f3: times.map(t => nullIfNaN(getFormantAtTime(formant, 3, t))),
					f4: times.map(t => nullIfNaN(getFormantAtTime(formant, 4, t))),
					b1: times.map(t => nullIfNaN(getBandwidthAtTime(formant, 1, t))),
					b2: times.map(t => nullIfNaN(getBandwidthAtTime(formant, 2, t))),
					b3: times.map(t => nullIfNaN(getBandwidthAtTime(formant, 3, t))),
					b4: times.map(t => nullIfNaN(getBandwidthAtTime(formant, 4, t)))
				},
				harmonicity: times.map(t => nullIfNaN(getHarmonicityAtTime(harmonicity, t))),
				cog: spectralMeasures.cog,
				spectralTilt: spectralMeasures.spectralTilt,
				a1p0: spectralMeasures.a1p0,
				spectrogram: spectrogramInfo
			};

			// Free WASM objects
			pitch.free();
			intensity.free();
			formant.free();
			harmonicity.free();
			if (spectrogram) {
				spectrogram.free();
			}

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
			const spectrum = computeSpectrum(segmentSound, true);

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
