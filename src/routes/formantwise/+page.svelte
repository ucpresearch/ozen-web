<!--
	Formantwise — Vowel Formant Extraction Page (/formantwise)

	Standalone page that runs the formantwise-core WASM pipeline in-browser.
	Upload audio + intervals (CSV/TSV or TextGrid), configure speaker parameters,
	and download formant measurements as TSV.

	No dependency on main app stores or praatfan WASM.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { base } from '$app/paths';
	import { parseTextGrid } from '$lib/textgrid/parser';
	import { parseIntervalCSV, buildOutputTSV, parsePointsSpec, type MeasurementPoint } from '$lib/formantwise/csv';
	import { textGridToIntervals, ARPABET_VOWELS, IPA_VOWELS } from '$lib/formantwise/intervals';
	import type { ParsedIntervals, PipelineResults, SpeakerConfigResult, WorkerOutgoing } from '$lib/formantwise/types';
	import type { Tier } from '$lib/types';

	// ── Worker state ─────────────────────────────────────────────────────────
	let worker: Worker | null = null;
	let workerReady = false;

	// ── Audio state ──────────────────────────────────────────────────────────
	interface DecodedAudio {
		file: File;
		samples: Float64Array;
		sampleRate: number;
		duration: number;
	}
	let audioFiles: DecodedAudio[] = [];
	let selectedAudioIdx = 0;

	// Derived: the file selected for pipeline run
	$: activeAudio = audioFiles[selectedAudioIdx] ?? null;
	$: audioSamples = activeAudio?.samples ?? null;
	$: audioSampleRate = activeAudio?.sampleRate ?? 0;
	$: audioDuration = activeAudio?.duration ?? 0;
	$: audioFile = activeAudio?.file ?? null;

	// ── Interval state ───────────────────────────────────────────────────────
	let intervalFile: File | null = null;
	let parsedIntervals: ParsedIntervals | null = null;
	let intervalError = '';

	// TextGrid-specific state
	let textGridTiers: Tier[] | null = null;
	let selectedTier = '';
	let patternPreset: 'arpabet' | 'ipa' | 'custom' = 'arpabet';
	let customPattern = '';
	let regexError = '';
	let minDuration = 0.030;

	// ── Speaker parameters ───────────────────────────────────────────────────
	let gmean = '';
	let maxFormantMin = '4500';
	let maxFormantMax = '6500';
	let estimating = false;

	// ── Run state ────────────────────────────────────────────────────────────
	let running = false;
	let progress = 0;
	let progressStage = '';

	// ── Measurement points ───────────────────────────────────────────────────
	let pointsPreset = '50';
	let pointsSpec = '50';
	let pointsError = '';
	let parsedPoints: MeasurementPoint[] = [{ type: 'percent', value: 50 }];

	const POINTS_PRESETS: Record<string, string> = {
		'50': '50',
		'stable': 'stable',
		'50,stable': '50,stable',
		'20,50,80': '20,50,80',
		'custom': ''
	};

	// ── Results ──────────────────────────────────────────────────────────────
	let results: PipelineResults | null = null;
	let elapsed = 0;
	let errorMessage = '';

	// ── Theme ────────────────────────────────────────────────────────────────
	let isDarkTheme = true;

	// ── Derived values ───────────────────────────────────────────────────────

	$: currentPattern = getPattern(patternPreset, customPattern);
	$: patternDisplay = patternPreset === 'custom' ? customPattern : currentPattern?.source ?? '';

	// Reactively filter TextGrid intervals when tier/pattern/duration changes
	$: if (textGridTiers && selectedTier && currentPattern) {
		try {
			regexError = '';
			parsedIntervals = textGridToIntervals(textGridTiers, selectedTier, currentPattern, minDuration);
		} catch (e: unknown) {
			regexError = e instanceof Error ? e.message : String(e);
			parsedIntervals = null;
		}
	}

	// Sync preset dropdown → spec
	$: if (pointsPreset !== 'custom') {
		pointsSpec = POINTS_PRESETS[pointsPreset];
	}

	// Reactively parse measurement points spec
	$: {
		try {
			parsedPoints = parsePointsSpec(pointsSpec);
			pointsError = '';
		} catch (e: unknown) {
			pointsError = e instanceof Error ? e.message : String(e);
		}
	}

	$: canRun = workerReady && audioSamples && parsedIntervals && parsedIntervals.rows.length > 0 && !running && !estimating && !pointsError;

	function getPattern(preset: string, custom: string): RegExp | null {
		if (preset === 'arpabet') return ARPABET_VOWELS;
		if (preset === 'ipa') return IPA_VOWELS;
		try {
			return new RegExp(custom);
		} catch {
			return null;
		}
	}

	// ── Worker lifecycle ─────────────────────────────────────────────────────

	onMount(async () => {
		// Check saved theme
		const savedTheme = localStorage.getItem('ozen-theme');
		if (savedTheme === 'light') {
			isDarkTheme = false;
			document.documentElement.classList.add('light');
		}

		// Create worker using Vite's new URL() pattern (relative path required)
		worker = new Worker(
			new URL('../../lib/formantwise/worker.ts', import.meta.url),
			{ type: 'module' }
		);

		const wasmUrl = new URL(
			`${base}/wasm/formantwise/formantwise_core.js`,
			window.location.href
		).href;
		worker.postMessage({ type: 'init', wasmUrl });

		worker.onmessage = (e: MessageEvent<WorkerOutgoing>) => {
			const msg = e.data;
			switch (msg.type) {
				case 'ready':
					workerReady = true;
					break;
				case 'config':
					onSpeakerConfig(msg.result);
					break;
				case 'progress':
					progress = msg.fraction;
					progressStage = msg.stage;
					break;
				case 'result':
					onResult(msg.result, msg.elapsed);
					break;
				case 'error':
					onError(msg.message);
					break;
			}
		};
	});

	onDestroy(() => {
		worker?.terminate();
	});

	// ── Audio handling ───────────────────────────────────────────────────────

	async function decodeAudioFile(file: File): Promise<DecodedAudio> {
		const arrayBuffer = await file.arrayBuffer();

		// Detect native sample rate from WAV header to avoid resampling.
		const wavInfo = parseWavHeader(arrayBuffer);
		let decoded: AudioBuffer;

		if (wavInfo) {
			const frames = Math.ceil(wavInfo.durationEstimate * wavInfo.sampleRate) + 1024;
			const offlineCtx = new OfflineAudioContext(1, frames, wavInfo.sampleRate);
			decoded = await offlineCtx.decodeAudioData(arrayBuffer.slice(0));
		} else {
			const audioCtx = new AudioContext();
			decoded = await audioCtx.decodeAudioData(arrayBuffer);
			await audioCtx.close();
		}

		const float32 = decoded.getChannelData(0);
		const samples = new Float64Array(float32.length);
		for (let i = 0; i < float32.length; i++) {
			samples[i] = float32[i];
		}
		return { file, samples, sampleRate: decoded.sampleRate, duration: decoded.duration };
	}

	async function handleAudioFiles(files: FileList | File[]) {
		audioFiles = [];
		selectedAudioIdx = 0;
		results = null;
		errorMessage = '';

		try {
			for (const file of files) {
				const decoded = await decodeAudioFile(file);
				audioFiles = [...audioFiles, decoded];
			}
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('Failed to decode audio:', e);
			errorMessage = `Failed to decode audio: ${msg}`;
		}
	}

	function onAudioInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) handleAudioFiles(input.files);
	}

	function onAudioDrop(e: DragEvent) {
		e.preventDefault();
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) handleAudioFiles(files);
	}

	// ── Interval handling ────────────────────────────────────────────────────

	async function handleIntervalFile(file: File) {
		intervalFile = file;
		parsedIntervals = null;
		textGridTiers = null;
		intervalError = '';
		results = null;

		try {
			const text = await file.text();

			// Detect TextGrid by content
			const trimmed = text.trimStart();
			if (trimmed.startsWith('"ooTextFile"') || trimmed.startsWith('File type =')) {
				const parsed = parseTextGrid(text);
				textGridTiers = parsed.tiers;
				// Auto-select first tier with intervals
				const intervalTier = parsed.tiers.find(t => t.intervals.length > 0);
				if (intervalTier) {
					selectedTier = intervalTier.name;
				}
				// parsedIntervals will be set reactively
			} else {
				parsedIntervals = parseIntervalCSV(text);
			}
		} catch (e: unknown) {
			intervalError = e instanceof Error ? e.message : String(e);
			intervalFile = null;
		}
	}

	function onIntervalInput(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files?.[0]) handleIntervalFile(input.files[0]);
	}

	function onIntervalDrop(e: DragEvent) {
		e.preventDefault();
		const file = e.dataTransfer?.files?.[0];
		if (file) handleIntervalFile(file);
	}

	// ── Speaker estimation ───────────────────────────────────────────────────

	function estimateSpeaker() {
		if (!worker || audioFiles.length === 0) return;
		estimating = true;

		// Concatenate all loaded audio files for a more robust estimate.
		// All files must share the same sample rate; use the first file's rate.
		const sr = audioFiles[0].sampleRate;
		let combined: Float64Array;
		if (audioFiles.length === 1) {
			combined = audioFiles[0].samples;
		} else {
			const totalLen = audioFiles.reduce((sum, a) => sum + a.samples.length, 0);
			combined = new Float64Array(totalLen);
			let offset = 0;
			for (const a of audioFiles) {
				combined.set(a.samples, offset);
				offset += a.samples.length;
			}
		}

		const configJson = '{}';
		worker.postMessage({ type: 'get_config', samples: combined, sampleRate: sr, configJson });
	}

	function onSpeakerConfig(result: SpeakerConfigResult) {
		estimating = false;
		gmean = result.speaker_gmean.toFixed(1);
		maxFormantMin = result.max_formant_min.toFixed(0);
		maxFormantMax = result.max_formant_max.toFixed(0);
	}

	// ── Run pipeline ─────────────────────────────────────────────────────────

	function runPipeline() {
		if (!worker || !audioSamples || !parsedIntervals) return;
		running = true;
		progress = 0;
		progressStage = '';
		results = null;
		errorMessage = '';

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const config: Record<string, any> = {
			max_formant_min: parseFloat(maxFormantMin) || 4500,
			max_formant_max: parseFloat(maxFormantMax) || 6500
		};
		if (gmean && parseFloat(gmean) > 0) {
			config.nearey_gmean = parseFloat(gmean);
		}

		worker.postMessage({
			type: 'run',
			samples: audioSamples,
			sampleRate: audioSampleRate,
			intervals: parsedIntervals.intervals,
			configJson: JSON.stringify(config)
		});
	}

	function onResult(result: PipelineResults, elapsedMs: number) {
		running = false;
		progress = 1;
		results = result;
		elapsed = elapsedMs;
	}

	function onError(message: string) {
		running = false;
		estimating = false;
		console.error('Formantwise WASM error:', message);
		errorMessage = message;
	}

	// ── Download ─────────────────────────────────────────────────────────────

	function makeDownloadName(ext: string): string {
		const baseName = audioFile?.name.replace(/\.[^.]+$/, '') ?? 'output';
		if (!results) return `${baseName}_formants.${ext}`;
		const g = Math.round(results.speaker_gmean);
		const lo = Math.round(results.effective_max_formant_min);
		const hi = Math.round(results.effective_max_formant_max);
		return `${baseName}_formants_g${g}_${lo}-${hi}.${ext}`;
	}

	function downloadTSV() {
		if (!parsedIntervals || !results) return;
		const tsv = buildOutputTSV(parsedIntervals, results, parsedPoints);
		triggerDownload(new Blob([tsv], { type: 'text/tab-separated-values' }), makeDownloadName('tsv'));
	}

	function downloadJSON() {
		if (!results) return;
		const json = JSON.stringify(results, null, 2);
		triggerDownload(new Blob([json], { type: 'application/json' }), makeDownloadName('json'));
	}

	function triggerDownload(blob: Blob, filename: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	// ── Theme ────────────────────────────────────────────────────────────────

	function toggleTheme() {
		isDarkTheme = !isDarkTheme;
		document.documentElement.classList.toggle('light', !isDarkTheme);
		localStorage.setItem('ozen-theme', isDarkTheme ? 'dark' : 'light');
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	function formatDuration(s: number): string {
		if (s < 60) return `${s.toFixed(1)}s`;
		const m = Math.floor(s / 60);
		return `${m}m ${(s % 60).toFixed(1)}s`;
	}

	function preventDefault(e: DragEvent) {
		e.preventDefault();
	}

	/**
	 * Parse WAV header to get native sample rate, avoiding unnecessary resampling.
	 * Returns null for non-WAV files.
	 */
	function parseWavHeader(buffer: ArrayBuffer): { sampleRate: number; durationEstimate: number } | null {
		if (buffer.byteLength < 44) return null;
		const view = new DataView(buffer);
		// Check "RIFF" and "WAVE" markers
		if (view.getUint32(0, false) !== 0x52494646) return null;
		if (view.getUint32(8, false) !== 0x57415645) return null;

		// Scan for "fmt " chunk
		let offset = 12;
		while (offset < buffer.byteLength - 8) {
			const chunkId = view.getUint32(offset, false);
			const chunkSize = view.getUint32(offset + 4, true);
			if (chunkId === 0x666d7420) { // "fmt "
				const channels = view.getUint16(offset + 10, true);
				const sampleRate = view.getUint32(offset + 12, true);
				const bitsPerSample = view.getUint16(offset + 22, true);
				const bytesPerSample = (bitsPerSample / 8) * channels;
				const dataSize = buffer.byteLength - 44; // conservative estimate
				const durationEstimate = bytesPerSample > 0 ? dataSize / (sampleRate * bytesPerSample) : 0;
				return { sampleRate, durationEstimate };
			}
			offset += 8 + chunkSize;
			if (chunkSize % 2 !== 0) offset++; // RIFF chunks are word-aligned
		}
		return null;
	}
</script>

<svelte:head>
	<title>Formantwise - Vowel Formant Extraction</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<div class="header-left">
			<a href="{base}/" class="back-link" title="Back to Ozen">Ozen</a>
			<span class="header-sep">/</span>
			<h1>Formantwise</h1>
		</div>
		<div class="header-right">
			{#if !workerReady}
				<span class="status loading">Loading WASM...</span>
			{:else}
				<span class="status ready">Ready</span>
			{/if}
			<button class="theme-btn" on:click={toggleTheme} title="Toggle theme">
				{#if isDarkTheme}
					<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
						<path d="M12 3a9 9 0 109 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 01-4.4 2.26 5.403 5.403 0 01-3.14-9.8c-.44-.06-.9-.1-1.36-.1z"/>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
						<circle cx="12" cy="12" r="5"/>
						<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
					</svg>
				{/if}
			</button>
		</div>
	</header>

	<main class="content">
		<p class="disclaimer">This uses the web version of Formantwise, still under active development. Questions and feedback welcome. Speaker gmean, floor, and ceiling estimates may differ slightly from the Python and Rust versions due to browser audio decoding differences, and should be recorded alongside the extraction. Default TSV filenames contain this information, and JSON download files contain this information and additional details that can help reproduce the results.</p>

		<!-- 1. Audio Upload -->
		<section class="section">
			<h2>1. Audio</h2>
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div
				class="drop-zone"
				on:drop={onAudioDrop}
				on:dragover={preventDefault}
				on:dragenter={preventDefault}
			>
				<input
					type="file"
					accept=".wav,.flac,.mp3,.ogg"
					multiple
					on:change={onAudioInput}
					id="audio-input"
				/>
				<label for="audio-input" class="drop-label">
					Drop audio file(s) here or click to browse
				</label>
			</div>
			{#if audioFiles.length === 1}
				<p class="file-info">
					{audioFiles[0].file.name} &mdash; {audioFiles[0].sampleRate} Hz, {formatDuration(audioFiles[0].duration)}
				</p>
			{:else if audioFiles.length > 1}
				<div class="file-list">
					<p class="file-info">{audioFiles.length} files loaded (all used for estimation; select one for extraction):</p>
					{#each audioFiles as a, i}
						<label class="file-radio">
							<input type="radio" bind:group={selectedAudioIdx} value={i} />
							<span class:active={i === selectedAudioIdx}>{a.file.name} &mdash; {a.sampleRate} Hz, {formatDuration(a.duration)}</span>
						</label>
					{/each}
				</div>
			{/if}
		</section>

		<!-- 2. Intervals -->
		<section class="section">
			<h2>2. Intervals</h2>
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<div
				class="drop-zone"
				on:drop={onIntervalDrop}
				on:dragover={preventDefault}
				on:dragenter={preventDefault}
			>
				<input
					type="file"
					accept=".csv,.tsv,.txt,.TextGrid"
					on:change={onIntervalInput}
					id="interval-input"
				/>
				<label for="interval-input" class="drop-label">
					Drop CSV/TSV/TextGrid here or click to browse
				</label>
			</div>

			{#if intervalError}
				<p class="error">{intervalError}</p>
			{/if}

			{#if textGridTiers}
				<div class="textgrid-options">
					<div class="form-row">
						<label for="tier-select">Tier:</label>
						<select id="tier-select" bind:value={selectedTier}>
							{#each textGridTiers as tier}
								<option value={tier.name}>{tier.name} ({tier.intervals.length})</option>
							{/each}
						</select>
					</div>
					<div class="form-row">
						<label for="pattern-preset">Pattern:</label>
						<select id="pattern-preset" bind:value={patternPreset}>
							<option value="arpabet">ARPABET</option>
							<option value="ipa">IPA</option>
							<option value="custom">Custom</option>
						</select>
						{#if patternPreset === 'custom'}
							<input
								type="text"
								bind:value={customPattern}
								placeholder="Regular expression"
								class="regex-input"
							/>
						{:else}
							<input
								type="text"
								value={patternDisplay}
								readonly
								class="regex-input readonly"
							/>
						{/if}
					</div>
					{#if regexError}
						<p class="error">{regexError}</p>
					{/if}
					<div class="form-row">
						<label for="min-dur">Min duration:</label>
						<input id="min-dur" type="number" bind:value={minDuration} min="0" max="1" step="0.001" class="num-input" />
						<span class="unit">s</span>
					</div>
					{#if parsedIntervals}
						<p class="match-count">{parsedIntervals.rows.length} matching intervals</p>
					{/if}
				</div>
			{:else if parsedIntervals}
				<p class="file-info">
					{intervalFile?.name} &mdash; {parsedIntervals.rows.length} intervals
				</p>
			{/if}
		</section>

		<!-- 3. Speaker Parameters (estimated) -->
		<section class="section">
			<h2>3. Speaker parameters</h2>
			<div class="params-grid">
				<div class="form-row">
					<label for="gmean" title="Geometric mean of F1, F2, and F3">Gmean:</label>
					<input id="gmean" type="number" bind:value={gmean} placeholder="auto" class="num-input" title="Geometric mean of F1, F2, and F3" />
					<span class="unit">Hz</span>
					<button
						class="estimate-btn"
						on:click={estimateSpeaker}
						disabled={!audioSamples || !workerReady || estimating}
					>
						{estimating ? 'Estimating...' : 'Estimate'}
					</button>
				</div>
				<div class="form-row">
					<label for="fmin">Formant min:</label>
					<input id="fmin" type="number" bind:value={maxFormantMin} class="num-input" />
					<span class="unit">Hz</span>
					<label for="fmax">Max:</label>
					<input id="fmax" type="number" bind:value={maxFormantMax} class="num-input" />
					<span class="unit">Hz</span>
				</div>
			</div>
		</section>

		<!-- 4. Analysis Parameters -->
		<section class="section">
			<h2>4. Analysis parameters</h2>
			<div class="params-grid">
				<div class="form-row">
					<label for="points-preset">Points:</label>
					<select id="points-preset" bind:value={pointsPreset}>
						<option value="50">50 (midpoint)</option>
						<option value="stable">stable</option>
						<option value="50,stable">50, stable</option>
						<option value="20,50,80">20, 50, 80</option>
						<option value="custom">Custom</option>
					</select>
					{#if pointsPreset === 'custom'}
						<input type="text" bind:value={pointsSpec} placeholder="e.g. 25,50,75,stable" class="regex-input" />
					{/if}
				</div>
				{#if pointsError}
					<p class="error">{pointsError}</p>
				{/if}
			</div>
		</section>

		{#if errorMessage}
			<section class="section error-section">
				<p class="error">{errorMessage}</p>
				<button class="dismiss-btn" on:click={() => errorMessage = ''}>Dismiss</button>
			</section>
		{/if}

		<!-- Run Button + Progress -->
		<section class="section run-section">
			<button class="run-btn" on:click={runPipeline} disabled={!canRun}>
				{running ? 'Running...' : 'Run Formantwise'}
			</button>
			{#if running}
				<div class="progress-bar">
					<div class="progress-fill" style="width: {(progress * 100).toFixed(1)}%"></div>
				</div>
				<p class="progress-label">{(progress * 100).toFixed(0)}% &mdash; {progressStage}</p>
			{/if}
		</section>

		<!-- 4. Results -->
		{#if results}
			<section class="section results-section">
				<h2>4. Results</h2>
				<div class="result-stats">
					<p>Speaker gmean: <strong>{results.speaker_gmean.toFixed(1)} Hz</strong></p>
					<p>Ceiling range: <strong>{results.effective_max_formant_min.toFixed(1)} &ndash; {results.effective_max_formant_max.toFixed(1)} Hz</strong></p>
					<p>Intervals: <strong>{parsedIntervals?.rows.length ?? 0}</strong> input &rarr; <strong>{results.vowel_summaries.length}</strong> with measurements</p>
					<p class="elapsed">Completed in {(elapsed / 1000).toFixed(1)}s</p>
				</div>

				<div class="download-buttons">
					<button class="download-btn" on:click={downloadTSV}>Download TSV</button>
					<button class="download-btn secondary" on:click={downloadJSON}>Download JSON</button>
				</div>

				{#if results.vowel_summaries.length > 0}
					<div class="preview">
						<h3>Preview (first 20 rows)</h3>
						<div class="table-wrap">
							<table>
								<thead>
									<tr>
										{#if parsedIntervals}
											{#each parsedIntervals.headers as h}
												<th>{h}</th>
											{/each}
										{/if}
										<th>point</th>
										<th>time</th>
										<th>onset</th>
										<th>offset</th>
										<th>F1</th>
										<th>F2</th>
										<th>F3</th>
										<th>F0</th>
									</tr>
								</thead>
								<tbody>
									{#each getPreviewRows(parsedIntervals, results, parsedPoints, 20) as row}
										<tr>
											{#each row as cell}
												<td>{cell}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			</section>
		{/if}
	</main>
</div>

<script lang="ts" context="module">
	function getPreviewRows(
		parsed: ParsedIntervals | null,
		results: PipelineResults,
		points: import('$lib/formantwise/csv').MeasurementPoint[],
		limit: number
	): string[][] {
		const summaryMap = new Map<number, import('$lib/formantwise/types').VowelSummary>();
		for (const vs of results.vowel_summaries) {
			summaryMap.set(vs.vowel_id, vs);
		}

		// Build frame index by vowel_id
		const framesByVowel = new Map<number, import('$lib/formantwise/types').FrameResult[]>();
		for (const fr of results.frame_results) {
			if (fr.vowel_id != null) {
				let arr = framesByVowel.get(fr.vowel_id);
				if (!arr) { arr = []; framesByVowel.set(fr.vowel_id, arr); }
				arr.push(fr);
			}
		}

		const rows: string[][] = [];
		if (!parsed) return rows;

		for (let i = 0; i < parsed.rows.length && rows.length < limit; i++) {
			const vs = summaryMap.get(i);
			if (!vs) continue;
			const passthrough = parsed.headers.map(h => parsed.rows[i][h] ?? '');
			const frames = framesByVowel.get(i);

			for (const pt of points) {
				if (rows.length >= limit) break;
				const vals = getPreviewValues(pt, vs, frames);
				rows.push([...passthrough, ...vals]);
			}
		}
		return rows;
	}

	function getPreviewValues(
		pt: import('$lib/formantwise/csv').MeasurementPoint,
		vs: import('$lib/formantwise/types').VowelSummary,
		frames: import('$lib/formantwise/types').FrameResult[] | undefined
	): string[] {
		if (pt.type === 'stable') {
			return ['stable', vs.stable_time.toFixed(3), vs.onset.toFixed(3), vs.offset.toFixed(3),
				vs.f1_mid.toFixed(1), vs.f2_mid.toFixed(1), vs.f3_mid.toFixed(1),
				vs.f0_mid.toFixed(1)];
		}
		if (pt.value === 50) {
			return ['50', vs.midpoint.toFixed(3), vs.onset.toFixed(3), vs.offset.toFixed(3),
				vs.f1_mp.toFixed(1), vs.f2_mp.toFixed(1), vs.f3_mp.toFixed(1),
				vs.f0_mid.toFixed(1)];
		}
		// Other percentages: nearest frame
		const t = vs.onset + (vs.offset - vs.onset) * (pt.value / 100);
		if (frames && frames.length > 0) {
			let best = frames[0];
			for (const fr of frames) {
				if (Math.abs(fr.time - t) < Math.abs(best.time - t)) best = fr;
			}
			return [String(pt.value), t.toFixed(3), vs.onset.toFixed(3), vs.offset.toFixed(3),
				best.f1.toFixed(1), best.f2.toFixed(1), best.f3.toFixed(1),
				best.f0.toFixed(1)];
		}
		return [String(pt.value), t.toFixed(3), vs.onset.toFixed(3), vs.offset.toFixed(3),
			'', '', '', ''];
	}
</script>

<style>
	.page {
		max-width: 800px;
		margin: 0 auto;
		padding: 1rem;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: 1.5rem;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.back-link {
		color: var(--color-primary);
		text-decoration: none;
		font-size: 0.9rem;
	}
	.back-link:hover {
		text-decoration: underline;
	}

	.header-sep {
		color: var(--color-text-muted);
	}

	h1 {
		font-size: 1.2rem;
		font-weight: 600;
		margin: 0;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.status {
		font-size: 0.8rem;
	}
	.status.loading {
		color: var(--color-text-muted);
	}
	.status.ready {
		color: #4ade80;
	}

	.theme-btn {
		background: none;
		border: none;
		color: var(--color-text-muted);
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
	}
	.theme-btn:hover {
		color: var(--color-text);
	}

	.section {
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 6px;
	}

	h2 {
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0 0 0.75rem;
	}

	h3 {
		font-size: 0.85rem;
		font-weight: 600;
		margin: 0.75rem 0 0.5rem;
	}

	.drop-zone {
		border: 2px dashed var(--color-border);
		border-radius: 6px;
		padding: 1.5rem;
		text-align: center;
		position: relative;
	}
	.drop-zone:hover {
		border-color: var(--color-primary);
	}
	.drop-zone input[type='file'] {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.drop-label {
		color: var(--color-text-muted);
		font-size: 0.9rem;
		cursor: pointer;
	}

	.file-info {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
		color: var(--color-text);
	}

	.file-list {
		margin-top: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.file-radio {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.file-radio span {
		color: var(--color-text-muted);
	}
	.file-radio span.active {
		color: var(--color-text);
		font-weight: 500;
	}

	.error {
		color: #f87171;
		font-size: 0.85rem;
		margin: 0.5rem 0 0;
	}

	.textgrid-options {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.form-row label {
		font-size: 0.85rem;
		color: var(--color-text-muted);
		white-space: nowrap;
	}

	select, .regex-input, .num-input {
		background: var(--color-bg);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		padding: 4px 8px;
		font-size: 0.85rem;
		font-family: inherit;
	}

	.num-input {
		width: 80px;
	}

	.regex-input {
		flex: 1;
		min-width: 120px;
		font-family: monospace;
	}
	.regex-input.readonly {
		opacity: 0.7;
	}

	.unit {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.match-count {
		margin: 0;
		font-size: 0.85rem;
		color: var(--color-primary);
		font-weight: 500;
	}

	.params-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.estimate-btn {
		background: var(--color-bg);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		padding: 4px 12px;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.estimate-btn:hover:not(:disabled) {
		border-color: var(--color-primary);
	}
	.estimate-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.run-section {
		text-align: center;
	}

	.run-btn {
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: 6px;
		padding: 10px 32px;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
	}
	.run-btn:hover:not(:disabled) {
		filter: brightness(1.1);
	}
	.run-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.progress-bar {
		height: 6px;
		background: var(--color-border);
		border-radius: 3px;
		margin-top: 0.75rem;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--color-primary);
		transition: width 0.1s ease;
	}

	.progress-label {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin-top: 0.25rem;
	}

	.results-section h2 {
		margin-bottom: 0.5rem;
	}

	.result-stats {
		font-size: 0.85rem;
		line-height: 1.6;
	}
	.result-stats p {
		margin: 0;
	}
	.elapsed {
		color: var(--color-text-muted);
	}

	.download-buttons {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.download-btn {
		background: var(--color-primary);
		color: white;
		border: none;
		border-radius: 4px;
		padding: 8px 20px;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.download-btn.secondary {
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
	}
	.download-btn:hover {
		filter: brightness(1.1);
	}

	.disclaimer {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		line-height: 1.5;
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 6px;
	}

	.error-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.dismiss-btn {
		background: none;
		border: 1px solid var(--color-border);
		color: var(--color-text-muted);
		border-radius: 4px;
		padding: 4px 12px;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.unit-hint {
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}

	.preview {
		margin-top: 1rem;
	}

	.table-wrap {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: 4px;
	}

	table {
		border-collapse: collapse;
		font-size: 0.8rem;
		white-space: nowrap;
		width: 100%;
	}

	th, td {
		padding: 4px 8px;
		border-bottom: 1px solid var(--color-border);
		text-align: left;
	}

	th {
		background: var(--color-bg);
		font-weight: 600;
		position: sticky;
		top: 0;
	}

	tbody tr:hover {
		background: var(--color-bg);
	}
</style>
