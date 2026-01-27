<script lang="ts">
	import { onMount } from 'svelte';
	import FileDropZone from '$lib/components/FileDropZone.svelte';
	import Waveform from '$lib/components/Waveform.svelte';
	import Spectrogram from '$lib/components/Spectrogram.svelte';
	import TimeAxis from '$lib/components/TimeAxis.svelte';
	import AnnotationEditor from '$lib/components/AnnotationEditor.svelte';
	import ValuesPanel from '$lib/components/ValuesPanel.svelte';
	import { audioBuffer, sampleRate, fileName, duration } from '$lib/stores/audio';
	import { timeRange, selection, cursorPosition } from '$lib/stores/view';
	import { wasmReady, initWasm, currentBackend } from '$lib/wasm/acoustic';
	import { selectedBackend, type AcousticBackend } from '$lib/stores/config';
	import { isPlaying, togglePlayPause, playVisible, stop } from '$lib/audio/player';
	import { isAnalyzing, analysisProgress, runAnalysis, clearAnalysis } from '$lib/stores/analysis';
	import { selectedTierIndex, tiers } from '$lib/stores/annotations';
	import { loadConfigFromYaml, selectedPreset } from '$lib/stores/config';
	import { dataPoints, exportDataPointsTSV, importDataPointsTSV, clearDataPoints } from '$lib/stores/dataPoints';
	import { initUndoManager, undo, redo } from '$lib/stores/undoManager';

	let isDarkTheme = true;
	let configInput: HTMLInputElement;
	let pointsInput: HTMLInputElement;

	onMount(() => {
		// Load saved backend preference
		const savedBackend = localStorage.getItem('ozen-backend') as AcousticBackend | null;
		if (savedBackend === 'praatfan-gpl' || savedBackend === 'praatfan' || savedBackend === 'praatfan-local') {
			selectedBackend.set(savedBackend);
		}

		// Initialize WASM with selected backend
		initWasm($selectedBackend);
		initUndoManager(tiers, dataPoints);

		// Check for saved theme preference
		const savedTheme = localStorage.getItem('ozen-theme');
		if (savedTheme === 'light') {
			isDarkTheme = false;
			document.documentElement.classList.add('light');
		}

		// Global keyboard shortcuts
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	// Handle backend change
	async function handleBackendChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const newBackend = target.value as AcousticBackend;

		selectedBackend.set(newBackend);
		localStorage.setItem('ozen-backend', newBackend);

		// Reinitialize WASM with new backend
		try {
			await initWasm(newBackend);

			// Re-run analysis if audio is loaded
			if ($audioBuffer) {
				clearAnalysis();
				runAnalysis().catch(e => console.error('Analysis failed:', e));
			}
		} catch (e) {
			console.error('Failed to switch backend:', e);
		}
	}

	// Re-run analysis when formant preset changes (affects maxFormant for formant analysis)
	let previousPreset = $selectedPreset;
	$: if ($selectedPreset !== previousPreset) {
		previousPreset = $selectedPreset;
		if ($audioBuffer && $wasmReady) {
			clearAnalysis();
			runAnalysis().catch(e => console.error('Analysis failed:', e));
		}
	}

	function toggleTheme() {
		isDarkTheme = !isDarkTheme;
		if (isDarkTheme) {
			document.documentElement.classList.remove('light');
			localStorage.setItem('ozen-theme', 'dark');
		} else {
			document.documentElement.classList.add('light');
			localStorage.setItem('ozen-theme', 'light');
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		// Ignore if typing in an input
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
			return;
		}

		// Handle Ctrl/Cmd shortcuts
		if (e.ctrlKey || e.metaKey) {
			switch (e.key.toLowerCase()) {
				case 'z':
					e.preventDefault();
					if (e.shiftKey) {
						redo();
					} else {
						undo();
					}
					return;
				case 'y':
					e.preventDefault();
					redo();
					return;
			}
		}

		switch (e.code) {
			case 'Space':
				e.preventDefault();
				togglePlayPause();
				break;
			case 'Escape':
				e.preventDefault();
				stop();
				selection.set(null);
				break;
			case 'Tab':
				e.preventDefault();
				playVisible();
				break;
			// Number keys 1-5 to switch tiers
			case 'Digit1':
			case 'Digit2':
			case 'Digit3':
			case 'Digit4':
			case 'Digit5':
				const tierNum = parseInt(e.code.slice(-1)) - 1;
				if (tierNum < $tiers.length) {
					selectedTierIndex.set(tierNum);
				}
				break;
		}
	}

	async function handleFile(file: File) {
		// Clear previous analysis
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

		// Set duration and initial time range
		const audioDuration = decoded.length / decoded.sampleRate;
		duration.set(audioDuration);
		timeRange.set({ start: 0, end: Math.min(audioDuration, 10) });
		cursorPosition.set(0);
		selection.set(null);

		// Start analysis in background
		runAnalysis().catch(e => console.error('Analysis failed:', e));
	}

	function formatTime(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
	}

	// Overlay visibility state
	let showPitch = true;
	let showFormants = true;
	let showIntensity = false;
	let showHNR = false;
	let showCoG = false;
	let showSpectralTilt = false;
	let showA1P0 = false;
	let showDataPoints = true;

	// Spectrogram settings
	let maxFrequency = 5000;

	let fileInput: HTMLInputElement;

	function openFileDialog() {
		fileInput.click();
	}

	async function handleFileInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			await handleFile(file);
		}
		// Reset input so the same file can be selected again
		target.value = '';
	}

	function openConfigDialog() {
		configInput.click();
	}

	async function handleConfigInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			const text = await file.text();
			const newConfig = loadConfigFromYaml(text);

			// If config specifies a different backend, switch to it
			if (newConfig && newConfig.backend !== $currentBackend) {
				try {
					await initWasm(newConfig.backend);
					localStorage.setItem('ozen-backend', newConfig.backend);

					// Re-run analysis if audio is loaded
					if ($audioBuffer) {
						clearAnalysis();
						runAnalysis().catch(e => console.error('Analysis failed:', e));
					}
				} catch (err) {
					console.error('Failed to switch backend:', err);
				}
			}
		}
		target.value = '';
	}

	async function handleExportDataPoints() {
		const content = exportDataPointsTSV();

		// Generate default filename from audio file name
		let defaultName = 'data_points.tsv';
		if ($fileName) {
			const baseName = $fileName.replace(/\.[^/.]+$/, '');
			defaultName = baseName + '_points.tsv';
		}

		// Try File System Access API (shows native Save As dialog)
		if ('showSaveFilePicker' in window) {
			try {
				const handle = await (window as any).showSaveFilePicker({
					suggestedName: defaultName,
					types: [{
						description: 'Tab-Separated Values',
						accept: { 'text/tab-separated-values': ['.tsv'] }
					}]
				});
				const writable = await handle.createWritable();
				await writable.write(content);
				await writable.close();
				return;
			} catch (err: any) {
				if (err.name === 'AbortError') return;
			}
		}

		// Fallback: traditional download
		const blob = new Blob([content], { type: 'text/tab-separated-values' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = defaultName;
		a.click();
		URL.revokeObjectURL(url);
	}

	function openPointsImportDialog() {
		pointsInput.click();
	}

	async function handlePointsImport(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			const content = await file.text();
			const count = importDataPointsTSV(content);
			if (count === -1) {
				console.error('Failed to import data points: invalid TSV format (need time and frequency columns)');
			}
		}
		target.value = '';
	}
</script>

<input
	type="file"
	accept="audio/*"
	bind:this={fileInput}
	on:change={handleFileInput}
	style="display: none"
/>

<input
	type="file"
	accept=".yaml,.yml"
	bind:this={configInput}
	on:change={handleConfigInput}
	style="display: none"
/>

<input
	type="file"
	accept=".tsv,.txt"
	bind:this={pointsInput}
	on:change={handlePointsImport}
	style="display: none"
/>

<main>
	{#if !$wasmReady}
		<div class="loading">Loading acoustic analysis engine...</div>
	{:else if !$audioBuffer}
		<FileDropZone onFile={handleFile} />
	{:else}
		<div class="app-container">
			<header class="toolbar">
				<div class="toolbar-left">
					<button
						class="open-btn"
						on:click={openFileDialog}
						title="Open audio file"
					>
						<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
							<path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
						</svg>
					</button>
					<button
						class="play-btn"
						class:playing={$isPlaying}
						on:click={togglePlayPause}
						title="Play/Pause (Space)"
					>
						{#if $isPlaying}
							<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
								<rect x="6" y="4" width="4" height="16"/>
								<rect x="14" y="4" width="4" height="16"/>
							</svg>
						{:else}
							<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
								<path d="M8 5v14l11-7z"/>
							</svg>
						{/if}
					</button>
					<button class="stop-btn" on:click={stop} title="Stop (Escape)">
						<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
							<rect x="6" y="6" width="12" height="12"/>
						</svg>
					</button>
					<span class="filename">{$fileName}</span>
				</div>
				<div class="toolbar-center">
					<span class="time-display">
						{formatTime($cursorPosition)} / {formatTime($audioBuffer.length / $sampleRate)}
					</span>
					{#if $selection}
						<span class="selection-info">
							Sel: {formatTime($selection.end - $selection.start)}
						</span>
					{/if}
				</div>
				<div class="toolbar-right">
					{#if $isAnalyzing}
						<span class="analysis-progress">Analyzing... {$analysisProgress}%</span>
					{/if}
					<span class="sample-rate">{$sampleRate} Hz</span>
					<button class="settings-btn" on:click={openConfigDialog} title="Load configuration file">
						<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
							<path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96a7.03 7.03 0 00-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87a.49.49 0 00.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 110-7.2 3.6 3.6 0 010 7.2z"/>
						</svg>
					</button>
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

			<div class="overlay-controls">
				<label class="overlay-toggle" title="Fundamental frequency (F0) - the perceived pitch of voiced speech">
					<input type="checkbox" bind:checked={showPitch} />
					<span class="toggle-label pitch">Pitch</span>
				</label>
				<label class="overlay-toggle" title="Formants (F1-F4) - resonant frequencies of the vocal tract that distinguish vowels">
					<input type="checkbox" bind:checked={showFormants} />
					<span class="toggle-label formants">Formants</span>
				</label>
				<label class="overlay-toggle" title="Intensity - sound pressure level in decibels (dB)">
					<input type="checkbox" bind:checked={showIntensity} />
					<span class="toggle-label intensity">Intensity</span>
				</label>
				<label class="overlay-toggle" title="Harmonics-to-Noise Ratio - measure of voice quality (higher = clearer voice)">
					<input type="checkbox" bind:checked={showHNR} />
					<span class="toggle-label hnr">HNR</span>
				</label>
				<label class="overlay-toggle" title="Center of Gravity - spectral centroid, indicates brightness of sound">
					<input type="checkbox" bind:checked={showCoG} />
					<span class="toggle-label cog">CoG</span>
				</label>
				<label class="overlay-toggle" title="Spectral Tilt - balance between low and high frequencies (dB difference 0-500 Hz vs 2000-4000 Hz)">
					<input type="checkbox" bind:checked={showSpectralTilt} />
					<span class="toggle-label tilt">Sp.Tilt</span>
				</label>
				<label class="overlay-toggle" title="A1-P0 Nasal Ratio - amplitude at F0 minus nasal pole (~250 Hz), indicates nasality">
					<input type="checkbox" bind:checked={showA1P0} />
					<span class="toggle-label a1p0">A1-P0</span>
				</label>
				<span class="controls-separator"></span>
				<label class="overlay-toggle" title="Data collection points - double-click to add, right-click to remove">
					<input type="checkbox" bind:checked={showDataPoints} />
					<span class="toggle-label points">Points</span>
				</label>
				<button
					class="import-points-btn"
					on:click={openPointsImportDialog}
					title="Import data points from TSV"
				>
					Import
				</button>
				{#if $dataPoints.length > 0}
					<button
						class="export-points-btn"
						on:click={handleExportDataPoints}
						title="Export data points to TSV"
					>
						Export ({$dataPoints.length})
					</button>
				{/if}
				<span class="controls-separator"></span>
				<label class="freq-selector">
					<span class="freq-label">Voice:</span>
					<select bind:value={$selectedPreset}>
						<option value="female">Female</option>
						<option value="male">Male</option>
						<option value="child">Child</option>
					</select>
				</label>
				<label class="freq-selector">
					<span class="freq-label">Max Freq:</span>
					<select bind:value={maxFrequency}>
						<option value={5000}>5 kHz</option>
						<option value={7500}>7.5 kHz</option>
						<option value={10000}>10 kHz</option>
					</select>
				</label>
				<label class="freq-selector" title="Acoustic analysis backend">
					<span class="freq-label">Backend:</span>
					<select value={$selectedBackend} on:change={handleBackendChange}>
						<option value="praatfan-local">praatfan (local)</option>
						<option value="praatfan">praatfan (remote)</option>
						<option value="praatfan-gpl">praatfan-gpl (remote)</option>
					</select>
				</label>
			</div>

			<div class="main-content">
				<div class="displays">
					<div class="display-panel waveform-panel">
						<Waveform />
					</div>
					<div class="display-panel spectrogram-panel">
						<Spectrogram {showPitch} {showFormants} {showIntensity} {showHNR} {showCoG} {showSpectralTilt} {showA1P0} {showDataPoints} maxFreq={maxFrequency} />
					</div>
					<div class="time-axis-panel">
						<TimeAxis />
					</div>
					<div class="display-panel annotation-panel">
						<AnnotationEditor />
					</div>
				</div>
				<ValuesPanel />
			</div>

			<footer class="status-bar">
				<span>View: {formatTime($timeRange.start)} - {formatTime($timeRange.end)}</span>
				<span>Space: play | Tab: play visible | Scroll: zoom</span>
			</footer>
		</div>
	{/if}
</main>

<style>
	main {
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--color-text-muted);
	}

	.app-container {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 1rem;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
		gap: 1rem;
	}

	.toolbar-left,
	.toolbar-center,
	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.toolbar-left {
		flex: 1;
	}

	.toolbar-right {
		flex: 1;
		justify-content: flex-end;
	}

	.open-btn,
	.play-btn,
	.stop-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 4px;
		background: var(--color-border);
		color: var(--color-text);
		transition: background 0.15s;
		cursor: pointer;
	}

	.open-btn:hover,
	.play-btn:hover,
	.stop-btn:hover {
		background: var(--color-primary);
	}

	.play-btn.playing {
		background: var(--color-primary);
	}

	.filename {
		font-weight: 500;
		margin-left: 0.5rem;
	}

	.time-display {
		font-family: monospace;
		font-size: 0.9rem;
	}

	.selection-info {
		font-family: monospace;
		font-size: 0.8rem;
		color: var(--color-primary);
		padding: 0.125rem 0.5rem;
		background: rgba(74, 158, 255, 0.15);
		border-radius: 4px;
	}

	.sample-rate {
		color: var(--color-text-muted);
		font-size: 0.8rem;
	}

	.theme-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--color-text-muted);
		transition: color 0.15s;
	}

	.theme-btn:hover {
		color: var(--color-text);
	}

	.settings-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 4px;
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
		transition: color 0.15s;
	}

	.settings-btn:hover {
		color: var(--color-text);
	}

	.analysis-progress {
		font-size: 0.8rem;
		color: var(--color-primary);
	}

	.overlay-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		padding: 0.35rem 1rem;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.overlay-toggle {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
		font-size: 0.8rem;
	}

	.overlay-toggle input {
		cursor: pointer;
	}

	.toggle-label {
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
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

	.toggle-label.points {
		color: #ffcc00;
		background: rgba(255, 204, 0, 0.15);
	}

	.export-points-btn {
		padding: 0.15rem 0.5rem;
		border: 1px solid rgba(255, 204, 0, 0.4);
		border-radius: 3px;
		background: rgba(255, 204, 0, 0.1);
		color: #ffcc00;
		font-size: 0.75rem;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s;
	}

	.export-points-btn:hover {
		background: rgba(255, 204, 0, 0.2);
		border-color: rgba(255, 204, 0, 0.6);
	}

	.import-points-btn {
		padding: 0.15rem 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.75rem;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}

	.import-points-btn:hover {
		background: rgba(255, 204, 0, 0.1);
		border-color: rgba(255, 204, 0, 0.4);
		color: #ffcc00;
	}

	.controls-separator {
		width: 1px;
		height: 16px;
		background: var(--color-border);
		margin: 0 0.25rem;
	}

	.freq-selector {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.8rem;
	}

	.freq-label {
		color: var(--color-text-muted);
	}

	.freq-selector select {
		padding: 0.15rem 0.4rem;
		border: 1px solid var(--color-border);
		border-radius: 3px;
		background: var(--color-surface);
		color: var(--color-text);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.freq-selector select:hover {
		border-color: var(--color-primary);
	}

	.main-content {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.displays {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.display-panel {
		border-bottom: 1px solid var(--color-border);
		position: relative;
	}

	.waveform-panel {
		height: 120px;
		min-height: 80px;
	}

	.spectrogram-panel {
		flex: 2;
		min-height: 200px;
	}

	.time-axis-panel {
		height: 24px;
		border-bottom: 1px solid var(--color-border);
	}

	.annotation-panel {
		flex: 1;
		min-height: 80px;
		max-height: 200px;
		border-bottom: none;
	}

	.status-bar {
		display: flex;
		justify-content: space-between;
		padding: 0.25rem 1rem;
		background: var(--color-surface);
		border-top: 1px solid var(--color-border);
		font-size: 0.75rem;
		color: var(--color-text-muted);
	}
</style>
