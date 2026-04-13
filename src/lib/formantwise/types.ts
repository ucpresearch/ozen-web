/**
 * TypeScript interfaces for formantwise-core WASM output and worker messages.
 */

// ── WASM output types ────────────────────────────────────────────────────────

export interface VowelSummary {
	vowel_id: number;
	onset: number;
	offset: number;
	midpoint: number;
	stable_start: number;
	stable_end: number;
	stable_time: number;
	duration: number;
	f1_mid: number;
	f2_mid: number;
	f3_mid: number;
	b1_mid: number;
	b2_mid: number;
	b3_mid: number;
	f0_mid: number;
	confidence: number;
	nasal_adjacent: boolean;
	f1_mp: number;
	f2_mp: number;
	f3_mp: number;
	b1_mp: number;
	b2_mp: number;
	b3_mp: number;
}

export interface FrameResult {
	time: number;
	f1: number;
	f2: number;
	f3: number;
	b1: number;
	b2: number;
	b3: number;
	f0: number;
	confidence: number;
	is_vowel: boolean;
	vowel_id: number | null;
}

export interface PipelineResults {
	vowel_summaries: VowelSummary[];
	frame_results: FrameResult[];
	speaker_gmean: number;
	effective_max_formant_min: number;
	effective_max_formant_max: number;
}

export interface SpeakerConfigResult {
	speaker_gmean: number;
	max_formant_min: number;
	max_formant_max: number;
	pitch_floor: number | null;
	pitch_ceiling: number | null;
}

// ── Interval parsing ─────────────────────────────────────────────────────────

export interface ParsedIntervals {
	headers: string[];
	rows: Record<string, string>[];
	intervals: Float64Array;
	source: 'csv' | 'textgrid';
}

// ── Worker messages ──────────────────────────────────────────────────────────

export type WorkerIncoming =
	| { type: 'init'; wasmUrl: string }
	| { type: 'get_config'; samples: Float64Array; sampleRate: number; configJson: string }
	| { type: 'run'; samples: Float64Array; sampleRate: number; intervals: Float64Array; configJson: string };

export type WorkerOutgoing =
	| { type: 'ready' }
	| { type: 'config'; result: SpeakerConfigResult }
	| { type: 'result'; result: PipelineResults; elapsed: number }
	| { type: 'progress'; fraction: number; stage: string }
	| { type: 'error'; message: string };
