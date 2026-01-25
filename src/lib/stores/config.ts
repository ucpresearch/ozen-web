/**
 * Configuration Store
 *
 * Manages application configuration with support for:
 * - Default Praat-style settings
 * - Loading custom config from YAML files
 * - Runtime configuration updates
 *
 * Configuration includes:
 * - Color schemes for all visual elements
 * - Formant presets (male/female/child)
 * - Spectrogram display settings
 * - Pitch display range
 * - Default annotation tier names
 *
 * Config is loaded from ./config.yaml on startup if present,
 * or can be loaded manually via the settings button.
 *
 * @module stores/config
 */

import { writable, get } from 'svelte/store';
import yaml from 'js-yaml';

/**
 * Application configuration interface with Praat-style defaults.
 */
/**
 * Backend options for acoustic analysis.
 * - 'praatfan-core': Full Praat reimplementation (GPL, from praatfan-core-rs CDN)
 * - 'praatfan': Clean-room implementation (MIT/Apache, from praatfan-core-clean CDN)
 * - 'praatfan-local': Clean-room implementation bundled locally (no network required)
 */
export type AcousticBackend = 'praatfan-core' | 'praatfan' | 'praatfan-local';

export interface OzenConfig {
	/**
	 * Which WASM backend to use for acoustic analysis.
	 */
	backend: AcousticBackend;
	colors: {
		waveform: {
			background: string;
			line: string;
			lineWidth: number;
		};
		spectrogram: {
			colormap: 'grayscale' | 'viridis';
		};
		cursor: string;
		cursorWidth: number;
		selection: {
			fill: string;
			border: string;
		};
		pitch: string;
		pitchWidth: number;
		intensity: string;
		intensityWidth: number;
		formant: {
			f1: string;
			f2: string;
			f3: string;
			f4: string;
			size: number;
		};
		tier: {
			background: string;
			selected: string;
			border: string;
			text: string;
		};
		boundary: string;
		boundaryHover: string;
		boundaryWidth: number;
	};
	formantPresets: {
		female: FormantPreset;
		male: FormantPreset;
		child: FormantPreset;
	};
	spectrogram: {
		dynamicRange: number;
		maxFrequency: number;
		windowLength: number;
		timeStep: number;
	};
	pitch: {
		displayFloor: number;
		displayCeiling: number;
	};
	annotation: {
		defaultTiers: string[];
	};
}

export interface FormantPreset {
	maxFormant: number;
	numFormants: number;
	pitchFloor: number;
	pitchCeiling: number;
}

/**
 * Default Praat-style configuration.
 */
export const defaultConfig: OzenConfig = {
	backend: 'praatfan-local',
	colors: {
		waveform: {
			background: '#ffffff',
			line: '#000000',
			lineWidth: 1
		},
		spectrogram: {
			colormap: 'grayscale'
		},
		cursor: '#ff0000',
		cursorWidth: 1,
		selection: {
			fill: 'rgba(255, 192, 203, 0.4)',
			border: '#ff0080'
		},
		pitch: '#0000ff',
		pitchWidth: 2,
		intensity: '#008000',
		intensityWidth: 2,
		formant: {
			f1: '#ff0000',
			f2: '#ff8080',
			f3: '#ff4040',
			f4: '#ffc0c0',
			size: 3
		},
		tier: {
			background: '#f5f5f5',
			selected: '#dcdcff',
			border: '#808080',
			text: '#000000'
		},
		boundary: '#0000ff',
		boundaryHover: '#ff0000',
		boundaryWidth: 2
	},
	formantPresets: {
		female: {
			maxFormant: 5500,
			numFormants: 5,
			pitchFloor: 100,
			pitchCeiling: 500
		},
		male: {
			maxFormant: 5000,
			numFormants: 5,
			pitchFloor: 75,
			pitchCeiling: 300
		},
		child: {
			maxFormant: 8000,
			numFormants: 5,
			pitchFloor: 150,
			pitchCeiling: 600
		}
	},
	spectrogram: {
		dynamicRange: 70.0,
		maxFrequency: 5000,
		windowLength: 0.005,
		timeStep: 0.002
	},
	pitch: {
		displayFloor: 75,
		displayCeiling: 500
	},
	annotation: {
		defaultTiers: ['words', 'phones']
	}
};

/**
 * Current configuration store.
 */
export const config = writable<OzenConfig>(defaultConfig);

/**
 * Currently selected formant preset.
 */
export const selectedPreset = writable<'female' | 'male' | 'child'>('female');

/**
 * Currently selected acoustic analysis backend.
 */
export const selectedBackend = writable<AcousticBackend>('praatfan-local');

/**
 * Get the current formant preset settings.
 */
export function getCurrentPreset(): FormantPreset {
	const cfg = get(config);
	const preset = get(selectedPreset);
	return cfg.formantPresets[preset];
}

/**
 * Deep merge two objects, with source values overriding target values.
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
	const result = { ...target };

	for (const key in source) {
		if (source[key] !== undefined) {
			if (
				typeof source[key] === 'object' &&
				source[key] !== null &&
				!Array.isArray(source[key]) &&
				typeof target[key] === 'object' &&
				target[key] !== null
			) {
				// Recursively merge nested objects
				result[key] = deepMerge(
					target[key] as Record<string, unknown>,
					source[key] as Record<string, unknown>
				) as T[Extract<keyof T, string>];
			} else {
				result[key] = source[key] as T[Extract<keyof T, string>];
			}
		}
	}

	return result;
}

/**
 * Load configuration from a YAML string and merge with defaults.
 * Returns the parsed config or null if parsing failed.
 */
export function loadConfigFromYaml(yamlContent: string): OzenConfig | null {
	try {
		const parsed = yaml.load(yamlContent) as Partial<OzenConfig>;
		if (parsed && typeof parsed === 'object') {
			const merged = deepMerge(defaultConfig, parsed);
			config.set(merged);

			// Sync backend setting with selectedBackend store
			if (merged.backend) {
				selectedBackend.set(merged.backend);
			}

			console.log('Configuration loaded from YAML');
			return merged;
		}
		return null;
	} catch (e) {
		console.warn('Failed to parse YAML config:', e);
		return null;
	}
}

/**
 * Load configuration from URL and merge with defaults.
 */
export async function loadConfigFromUrl(url: string): Promise<void> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const content = await response.text();
		loadConfigFromYaml(content);
	} catch (e) {
		console.log('No custom config found, using defaults');
	}
}

/**
 * Initialize configuration by attempting to load from config.yaml in the app directory.
 * Falls back to defaults if the file doesn't exist.
 */
export async function initConfig(): Promise<void> {
	// Use relative path so it works in subdirectories
	await loadConfigFromUrl('./config.yaml');
}
