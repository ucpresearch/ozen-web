/* tslint:disable */
/* eslint-disable */

/**
 * Run only the VTL prepass to get speaker-adapted config values.
 *
 * Returns `{ speaker_gmean, max_formant_min, max_formant_max }`.
 * Use these values to populate UI fields or feed back via `nearey_gmean`
 * / `max_formant_min` / `max_formant_max` in config_json to skip prepass
 * on subsequent calls.
 */
export function get_speaker_config(samples: Float64Array, sample_rate: number, config_json: string): any;

/**
 * Initialize WASM module (sets up panic hook for better error messages).
 */
export function init(): void;

/**
 * Run the formantwise pipeline on audio samples with automatic vowel detection.
 *
 * # Arguments
 * * `samples` - Audio samples as `&[f64]` (mono, full resolution)
 * * `sample_rate` - Sample rate in Hz
 * * `config_json` - JSON string with partial config overrides (use `"{}"` for defaults)
 * * `progress_cb` - Optional JS function called with `(fraction: number, stage: string)`
 */
export function run_formantwise(samples: Float64Array, sample_rate: number, config_json: string, progress_cb?: Function | null): any;

/**
 * Run the formantwise pipeline with user-supplied intervals.
 *
 * # Arguments
 * * `samples` - Audio samples as `&[f64]` (mono, full resolution)
 * * `sample_rate` - Sample rate in Hz
 * * `intervals_flat` - Flat array of `[start1, end1, start2, end2, ...]`
 * * `config_json` - JSON string with partial config overrides (use `"{}"` for defaults)
 * * `progress_cb` - Optional JS function called with `(fraction: number, stage: string)`
 */
export function run_formantwise_intervals(samples: Float64Array, sample_rate: number, intervals_flat: Float64Array, config_json: string, progress_cb?: Function | null): any;

/**
 * Run the formantwise pipeline with user-supplied intervals and formant priors.
 *
 * # Arguments
 * * `samples` - Audio samples as `&[f64]` (mono, full resolution)
 * * `sample_rate` - Sample rate in Hz
 * * `intervals_flat` - Flat array of `[start1, end1, start2, end2, ...]`
 * * `priors_flat` - Flat array of `[f1_1, f2_1, f3_1, f1_2, f2_2, f3_2, ...]`.
 *   Pass empty array for no priors. Use 0.0 for missing values.
 * * `config_json` - JSON string with partial config overrides (use `"{}"` for defaults)
 * * `progress_cb` - Optional JS function called with `(fraction: number, stage: string)`
 */
export function run_formantwise_intervals_with_priors(samples: Float64Array, sample_rate: number, intervals_flat: Float64Array, priors_flat: Float64Array, config_json: string, progress_cb?: Function | null): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly get_speaker_config: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly init: () => void;
    readonly run_formantwise: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly run_formantwise_intervals: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly run_formantwise_intervals_with_priors: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
