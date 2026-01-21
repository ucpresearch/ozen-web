/**
 * Core type definitions for ozen-web.
 */

/**
 * An annotation tier containing intervals or points.
 */
export interface Tier {
	name: string;
	type: 'interval' | 'point';
	intervals: Interval[];
}

/**
 * An interval on a tier with text label.
 */
export interface Interval {
	start: number;
	end: number;
	text: string;
}

/**
 * A point annotation (for point tiers).
 */
export interface Point {
	time: number;
	text: string;
}

/**
 * A data collection point on the spectrogram.
 */
export interface DataPoint {
	id: number;
	time: number;
	frequency: number;
	acousticValues: Record<string, number | null>;
	annotationIntervals: Record<string, string>;
}

/**
 * Analysis parameters.
 */
export interface AnalysisParams {
	timeStep: number;
	pitchFloor: number;
	pitchCeiling: number;
	maxFormant: number;
	windowLength: number;
	preEmphasis: number;
}

/**
 * Spectrogram data.
 */
export interface SpectrogramData {
	/** Power values as 2D array [freq][time] */
	values: Float64Array;
	freqMin: number;
	freqMax: number;
	timeMin: number;
	timeMax: number;
	nFreqs: number;
	nTimes: number;
}

/**
 * Complete analysis results for an audio file.
 */
export interface AnalysisResults {
	times: number[];
	pitch: (number | null)[];
	intensity: (number | null)[];
	formants: {
		f1: (number | null)[];
		f2: (number | null)[];
		f3: (number | null)[];
		f4: (number | null)[];
		b1: (number | null)[];
		b2: (number | null)[];
		b3: (number | null)[];
		b4: (number | null)[];
	};
	harmonicity: (number | null)[];
	cog: (number | null)[];
	spectralTilt: (number | null)[];
	a1p0: (number | null)[];
	spectrogram: SpectrogramData;
}

/**
 * Overlay track visibility settings.
 */
export interface OverlaySettings {
	pitch: boolean;
	intensity: boolean;
	formants: boolean;
	harmonicity: boolean;
	cog: boolean;
	spectralTilt: boolean;
}

/**
 * Application configuration.
 */
export interface Config {
	colors: {
		waveform: string;
		spectrogram: string;
		cursor: string;
		selection: string;
		pitch: string;
		intensity: string;
		formant: string;
		boundary: string;
	};
	pitch: {
		displayFloor: number;
		displayCeiling: number;
	};
	formantPresets: {
		female: { maxFormant: number };
		male: { maxFormant: number };
		child: { maxFormant: number };
	};
}
