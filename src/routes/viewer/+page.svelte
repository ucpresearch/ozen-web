<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import FileDropZone from '$lib/components/FileDropZone.svelte';
	import Waveform from '$lib/components/Waveform.svelte';
	import Spectrogram from '$lib/components/Spectrogram.svelte';
	import TimeAxis from '$lib/components/TimeAxis.svelte';
	import { audioBuffer, sampleRate, fileName, duration } from '$lib/stores/audio';
	import { timeRange, cursorPosition, selection } from '$lib/stores/view';
	import { wasmReady, initWasm } from '$lib/wasm/acoustic';
	import { isPlaying, playVisible, playRange, stop } from '$lib/audio/player';
	import { isAnalyzing, analysisProgress, runAnalysis, clearAnalysis, analysisResults } from '$lib/stores/analysis';
	import { attachGestureHandlers, type GestureCallbacks } from '$lib/touch/gestures';

	let gestureContainer: HTMLDivElement;
	let cleanupGestures: (() => void) | null = null;

	// Overlay visibility state
	let showPitch = true;
	let showFormants = true;
	let showIntensity = false;
	let showHNR = false;
	let showCoG = false;
	let showSpectralTilt = false;
	let showA1P0 = false;

	// Settings drawer state
	let showSettings = false;

	// Spectrogram settings
	let maxFrequency = 5000;

	// Selection state for gestures
	let selectionStartTime: number | null = null;

	onMount(() => {
		initWasm();
	});

	// Attach gesture handlers when container and audio are ready
	$: if (gestureContainer && $audioBuffer) {
		attachGestures();
	}

	function attachGestures() {
		// Clean up previous handlers
		if (cleanupGestures) {
			cleanupGestures();
		}

		if (!gestureContainer || !$audioBuffer) return;

		const audioDuration = $audioBuffer.length / $sampleRate;

		const callbacks: GestureCallbacks = {
			onPan: (deltaTime: number) => {
				const { start, end } = $timeRange;
				const visibleDuration = end - start;

				let newStart = start + deltaTime;
				let newEnd = end + deltaTime;

				// Clamp to audio bounds
				if (newStart < 0) {
					newStart = 0;
					newEnd = visibleDuration;
				}
				if (newEnd > audioDuration) {
					newEnd = audioDuration;
					newStart = Math.max(0, audioDuration - visibleDuration);
				}

				timeRange.set({ start: newStart, end: newEnd });
			},

			onZoom: (scale: number, centerTime: number) => {
				const { start, end } = $timeRange;
				const currentDuration = end - start;
				const newDuration = Math.max(0.01, Math.min(audioDuration, currentDuration / scale));

				// Calculate ratio of center time in current view
				const ratio = (centerTime - start) / currentDuration;

				// Apply zoom centered on the gesture center
				let newStart = centerTime - ratio * newDuration;
				let newEnd = centerTime + (1 - ratio) * newDuration;

				// Clamp to audio bounds
				if (newStart < 0) {
					newStart = 0;
					newEnd = Math.min(audioDuration, newDuration);
				}
				if (newEnd > audioDuration) {
					newEnd = audioDuration;
					newStart = Math.max(0, audioDuration - newDuration);
				}

				timeRange.set({ start: newStart, end: newEnd });
			},

			onTap: (time: number) => {
				// Position cursor, clear selection
				cursorPosition.set(time);
				selection.set(null);
			},

			onSelectionStart: (time: number) => {
				selectionStartTime = time;
				cursorPosition.set(time);
				selection.set(null);
			},

			onSelectionMove: (time: number) => {
				if (selectionStartTime !== null) {
					const start = Math.min(selectionStartTime, time);
					const end = Math.max(selectionStartTime, time);
					if (end - start > 0.001) {
						selection.set({ start, end });
					}
					cursorPosition.set(time);
				}
			},

			onSelectionEnd: () => {
				selectionStartTime = null;
			},

			getTimeFromX: (clientX: number) => {
				const rect = gestureContainer.getBoundingClientRect();
				const x = clientX - rect.left;
				const { start, end } = $timeRange;
				// Account for margins (same as Spectrogram: 45px each side)
				const leftMargin = 45;
				const rightMargin = 45;
				const plotWidth = rect.width - leftMargin - rightMargin;
				const relX = x - leftMargin;
				return start + (relX / plotWidth) * (end - start);
			},

			getVisibleDuration: () => {
				const { start, end } = $timeRange;
				return end - start;
			}
		};

		cleanupGestures = attachGestureHandlers(gestureContainer, callbacks);
	}

	onDestroy(() => {
		if (cleanupGestures) {
			cleanupGestures();
		}
	});

	async function handleFile(file: File) {
		clearAnalysis();

		const arrayBuffer = await file.arrayBuffer();
		const audioContext = new AudioContext();
		const decoded = await audioContext.decodeAudioData(arrayBuffer);

		// Convert to Float64Array (mono)
		const samples = new Float64Array(decoded.length);
		const channelData = decoded.getChannelData(0);
		for (let i = 0; i < decoded.length; i++) {
			samples[i] = channelData[i];
		}

		audioBuffer.set(samples);
		sampleRate.set(decoded.sampleRate);
		fileName.set(file.name);
		duration.set(decoded.length / decoded.sampleRate);

		// Set initial time range to full file (max 10s visible)
		const dur = decoded.length / decoded.sampleRate;
		timeRange.set({ start: 0, end: Math.min(dur, 10) });
		cursorPosition.set(0);
		selection.set(null);

		// Start analysis in background
		runAnalysis().catch(e => console.error('Analysis failed:', e));
	}

	function togglePlay() {
		if ($isPlaying) {
			stop();
		} else if ($selection) {
			playRange($selection.start, $selection.end);
		} else {
			playVisible();
		}
	}

	function closeSettings() {
		showSettings = false;
	}

	function formatTime(seconds: number): string {
		return seconds.toFixed(3);
	}

	function formatHz(hz: number | null): string {
		if (hz === null) return '-';
		return Math.round(hz).toString();
	}

	function formatDb(db: number | null): string {
		if (db === null) return '-';
		return db.toFixed(1);
	}

	// Get values at cursor position
	$: cursorValues = (() => {
		if (!$analysisResults) return null;

		const { times, pitch, intensity, formants, harmonicity, cog, spectralTilt, a1p0 } = $analysisResults;
		const cursor = $cursorPosition;

		// Find closest time index
		let closestIdx = 0;
		let closestDist = Infinity;
		for (let i = 0; i < times.length; i++) {
			const dist = Math.abs(times[i] - cursor);
			if (dist < closestDist) {
				closestDist = dist;
				closestIdx = i;
			}
		}

		return {
			pitch: pitch[closestIdx],
			intensity: intensity[closestIdx],
			f1: formants.f1[closestIdx],
			f2: formants.f2[closestIdx],
			f3: formants.f3[closestIdx],
			f4: formants.f4[closestIdx],
			hnr: harmonicity[closestIdx],
			cog: cog ? cog[closestIdx] : null,
			spectralTilt: spectralTilt ? spectralTilt[closestIdx] : null,
			a1p0: a1p0 ? a1p0[closestIdx] : null
		};
	})();
</script>

<svelte:head>
	<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>

<main class="viewer-main">
	{#if !$wasmReady}
		<div class="loading">Loading acoustic analysis engine...</div>
	{:else if !$audioBuffer}
		<FileDropZone onFile={handleFile} />
	{:else}
		<header class="viewer-header">
			<span class="filename">{$fileName}</span>
			{#if $isAnalyzing}
				<span class="analysis-progress">{$analysisProgress}%</span>
			{/if}
			<button
				class="settings-toggle"
				class:active={showSettings}
				on:click={() => showSettings = !showSettings}
				aria-label="Toggle overlay settings"
			>
				<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
					<path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
				</svg>
			</button>
		</header>

		<!-- Compact values bar - two rows -->
		<div class="values-bar">
			<div class="values-row">
				<span class="value-item">
					<span class="value-label">T:</span>
					<span class="value-num">{formatTime($cursorPosition)}s</span>
				</span>
				{#if cursorValues}
					<span class="value-item pitch">
						<span class="value-label">F0:</span>
						<span class="value-num">{formatHz(cursorValues.pitch)}</span>
					</span>
					<span class="value-item intensity">
						<span class="value-label">Int:</span>
						<span class="value-num">{formatDb(cursorValues.intensity)}</span>
					</span>
					<span class="value-item hnr">
						<span class="value-label">HNR:</span>
						<span class="value-num">{formatDb(cursorValues.hnr)}</span>
					</span>
				{/if}
				{#if $selection}
					<span class="value-item selection">
						<span class="value-label">Sel:</span>
						<span class="value-num">{($selection.end - $selection.start).toFixed(3)}s</span>
					</span>
				{/if}
			</div>
			{#if cursorValues}
				<div class="values-row">
					<span class="value-item formant">
						<span class="value-label">F1:</span>
						<span class="value-num">{formatHz(cursorValues.f1)}</span>
					</span>
					<span class="value-item formant">
						<span class="value-label">F2:</span>
						<span class="value-num">{formatHz(cursorValues.f2)}</span>
					</span>
					<span class="value-item formant">
						<span class="value-label">F3:</span>
						<span class="value-num">{formatHz(cursorValues.f3)}</span>
					</span>
					<span class="value-item formant">
						<span class="value-label">F4:</span>
						<span class="value-num">{formatHz(cursorValues.f4)}</span>
					</span>
					{#if cursorValues.cog !== null}
						<span class="value-item cog">
							<span class="value-label">CoG:</span>
							<span class="value-num">{formatHz(cursorValues.cog)}</span>
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<div
			class="gesture-container"
			bind:this={gestureContainer}
		>
			<div class="waveform-panel">
				<Waveform />
			</div>
			<div class="spectrogram-panel">
				<Spectrogram
					{showPitch}
					{showFormants}
					{showIntensity}
					{showHNR}
					{showCoG}
					{showSpectralTilt}
					{showA1P0}
					showDataPoints={false}
					maxFreq={maxFrequency}
				/>
			</div>
			<div class="time-axis-panel">
				<TimeAxis />
			</div>
		</div>

		<!-- Floating play button -->
		<button
			class="fab-play"
			class:playing={$isPlaying}
			on:click={togglePlay}
			aria-label={$isPlaying ? 'Pause' : 'Play'}
		>
			{#if $isPlaying}
				<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
					<rect x="6" y="4" width="4" height="16"/>
					<rect x="14" y="4" width="4" height="16"/>
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
					<path d="M8 5v14l11-7z"/>
				</svg>
			{/if}
		</button>

		<!-- Settings drawer -->
		{#if showSettings}
			<div class="settings-backdrop" on:click={closeSettings} on:keydown={(e) => e.key === 'Escape' && closeSettings()} role="button" tabindex="0" aria-label="Close settings"></div>
			<div class="settings-drawer">
				<div class="drawer-header">
					<h3>Settings</h3>
					<button class="close-btn" on:click={closeSettings} aria-label="Close">
						<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
							<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
						</svg>
					</button>
				</div>

				<h4>Overlays</h4>
				<label class="toggle-row">
					<input type="checkbox" bind:checked={showPitch} />
					<span class="toggle-label pitch">Pitch</span>
				</label>
				<label class="toggle-row">
					<input type="checkbox" bind:checked={showFormants} />
					<span class="toggle-label formants">Formants</span>
				</label>
				<label class="toggle-row">
					<input type="checkbox" bind:checked={showIntensity} />
					<span class="toggle-label intensity">Intensity</span>
				</label>
				<label class="toggle-row">
					<input type="checkbox" bind:checked={showHNR} />
					<span class="toggle-label hnr">HNR</span>
				</label>
				<label class="toggle-row">
					<input type="checkbox" bind:checked={showCoG} />
					<span class="toggle-label cog">CoG</span>
				</label>
				<label class="toggle-row">
					<input type="checkbox" bind:checked={showSpectralTilt} />
					<span class="toggle-label tilt">Spectral Tilt</span>
				</label>
				<label class="toggle-row">
					<input type="checkbox" bind:checked={showA1P0} />
					<span class="toggle-label a1p0">A1-P0</span>
				</label>

				<h4>Display</h4>
				<label class="select-row">
					<span>Max Frequency</span>
					<select bind:value={maxFrequency}>
						<option value={5000}>5 kHz</option>
						<option value={7500}>7.5 kHz</option>
						<option value={10000}>10 kHz</option>
					</select>
				</label>

				<div class="help-text">
					<strong>Gestures:</strong><br/>
					Tap: position cursor<br/>
					Drag (1 finger): select region<br/>
					Drag (2 fingers): pan view<br/>
					Pinch: zoom in/out
				</div>
			</div>
		{/if}
	{/if}
</main>

<style>
	.viewer-main {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		overscroll-behavior: none;
		/* Safe area insets for notched phones */
		padding-top: env(safe-area-inset-top);
		padding-bottom: env(safe-area-inset-bottom);
		padding-left: env(safe-area-inset-left);
		padding-right: env(safe-area-inset-right);
		background: var(--color-bg);
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--color-text-muted);
	}

	.viewer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.25rem 0.5rem;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		min-height: 40px;
		flex-shrink: 0;
	}

	.filename {
		font-weight: 500;
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		margin-right: 0.5rem;
	}

	.analysis-progress {
		font-size: 0.7rem;
		color: var(--color-primary);
		margin-right: 0.5rem;
		padding: 0.15rem 0.4rem;
		background: rgba(74, 158, 255, 0.15);
		border-radius: 4px;
	}

	.settings-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
		flex-shrink: 0;
	}

	.settings-toggle:hover,
	.settings-toggle.active {
		background: var(--color-border);
		color: var(--color-text);
	}

	/* Values bar */
	.values-bar {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.2rem 0.5rem;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		font-size: 0.65rem;
		font-family: monospace;
		flex-shrink: 0;
	}

	.values-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		overflow-x: auto;
	}

	.value-item {
		display: flex;
		gap: 0.15rem;
		white-space: nowrap;
	}

	.value-label {
		color: var(--color-text-muted);
	}

	.value-num {
		color: var(--color-text);
	}

	.value-item.pitch .value-num {
		color: #60a5fa;
	}

	.value-item.formant .value-num {
		color: #f87171;
	}

	.value-item.intensity .value-num {
		color: #4ade80;
	}

	.value-item.hnr .value-num {
		color: #fbbf24;
	}

	.value-item.cog .value-num {
		color: #c084fc;
	}

	.value-item.selection {
		padding: 0.1rem 0.3rem;
		background: rgba(74, 158, 255, 0.15);
		border-radius: 3px;
	}

	.value-item.selection .value-num {
		color: var(--color-primary);
	}

	.gesture-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		touch-action: none;
		min-height: 0; /* Important for flex child to shrink */
	}

	.waveform-panel {
		height: 60px;
		min-height: 50px;
		flex-shrink: 0;
		border-bottom: 1px solid var(--color-border);
	}

	.spectrogram-panel {
		flex: 1;
		min-height: 100px;
	}

	.time-axis-panel {
		height: 20px;
		flex-shrink: 0;
	}

	/* Floating Action Button for Play */
	.fab-play {
		position: fixed;
		bottom: calc(16px + env(safe-area-inset-bottom));
		right: calc(16px + env(safe-area-inset-right));
		width: 56px;
		height: 56px;
		border: none;
		border-radius: 50%;
		background: var(--color-primary);
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		transition: transform 0.15s, background 0.15s;
		z-index: 100;
	}

	.fab-play:hover {
		transform: scale(1.05);
	}

	.fab-play:active {
		transform: scale(0.95);
	}

	.fab-play.playing {
		background: #ef4444;
	}

	/* Settings drawer */
	.settings-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 200;
	}

	.settings-drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(300px, 85vw);
		background: var(--color-surface);
		border-left: 1px solid var(--color-border);
		padding: 0.75rem;
		padding-top: calc(0.75rem + env(safe-area-inset-top));
		padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
		z-index: 201;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.drawer-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.close-btn:hover {
		background: var(--color-border);
		color: var(--color-text);
	}

	.settings-drawer h4 {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0.75rem 0 0.5rem 0;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--color-border);
		cursor: pointer;
		min-height: 44px;
	}

	.toggle-row input[type="checkbox"] {
		width: 20px;
		height: 20px;
		cursor: pointer;
		flex-shrink: 0;
	}

	.toggle-label {
		font-size: 0.85rem;
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
	}

	.toggle-label.pitch {
		color: #60a5fa;
		background: rgba(96, 165, 250, 0.15);
	}

	.toggle-label.formants {
		color: #f87171;
		background: rgba(248, 113, 113, 0.15);
	}

	.toggle-label.intensity {
		color: #4ade80;
		background: rgba(74, 222, 128, 0.15);
	}

	.toggle-label.hnr {
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.15);
	}

	.toggle-label.cog {
		color: #c084fc;
		background: rgba(192, 132, 252, 0.15);
	}

	.toggle-label.tilt {
		color: #22d3ee;
		background: rgba(34, 211, 238, 0.15);
	}

	.toggle-label.a1p0 {
		color: #fb7185;
		background: rgba(251, 113, 133, 0.15);
	}

	.select-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--color-border);
		min-height: 44px;
	}

	.select-row span {
		font-size: 0.85rem;
		color: var(--color-text);
	}

	.select-row select {
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-bg);
		color: var(--color-text);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.help-text {
		margin-top: auto;
		padding-top: 1rem;
		font-size: 0.75rem;
		color: var(--color-text-muted);
		line-height: 1.5;
	}

	.help-text strong {
		color: var(--color-text);
	}

	/* Landscape adjustments */
	@media (orientation: landscape) and (max-height: 500px) {
		.viewer-header {
			min-height: 28px;
			padding: 0.1rem 0.5rem;
		}

		.values-bar {
			flex-direction: row;
			gap: 0.75rem;
			padding: 0.1rem 0.5rem;
			font-size: 0.6rem;
			overflow-x: auto;
		}

		.values-row {
			gap: 0.4rem;
		}

		.waveform-panel {
			height: 35px;
			min-height: 30px;
		}

		.time-axis-panel {
			height: 16px;
		}

		.fab-play {
			width: 44px;
			height: 44px;
			bottom: calc(6px + env(safe-area-inset-bottom));
			right: calc(6px + env(safe-area-inset-right));
		}
	}

	/* Touch-friendly adjustments */
	@media (pointer: coarse) {
		.toggle-row {
			padding: 0.6rem 0;
		}

		.select-row {
			padding: 0.6rem 0;
		}
	}
</style>
