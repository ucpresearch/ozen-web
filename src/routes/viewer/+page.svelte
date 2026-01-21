<!--
	Mobile Viewer Page (/viewer)

	A touch-optimized, view-only version of Ozen for phones and tablets.
	Supports loading audio files or recording directly from the microphone.

	Features:
	- Touch gestures: tap (cursor), drag (select), two-finger drag (pan), pinch (zoom)
	- Microphone recording with MediaRecorder API
	- Compact values bar showing acoustic measurements
	- Floating play button (FAB)
	- Settings drawer for overlay toggles

	No editing features (annotations, data points, undo) - view only.
-->
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

	// ─────────────────────────────────────────────────────────────────────────────
	// Component State
	// ─────────────────────────────────────────────────────────────────────────────

	/** Container element for touch gesture handling */
	let gestureContainer: HTMLDivElement;

	/** Cleanup function returned by attachGestureHandlers */
	let cleanupGestures: (() => void) | null = null;

	// ─────────────────────────────────────────────────────────────────────────────
	// Overlay Visibility
	// ─────────────────────────────────────────────────────────────────────────────
	// Controls which acoustic overlays are displayed on the spectrogram

	let showPitch = true;        // F0 (fundamental frequency)
	let showFormants = true;     // F1-F4 resonant frequencies
	let showIntensity = false;   // Sound pressure level (dB)
	let showHNR = false;         // Harmonics-to-Noise Ratio
	let showCoG = false;         // Center of Gravity (spectral centroid)
	let showSpectralTilt = false; // High vs low frequency balance
	let showA1P0 = false;        // Nasal measure (A1 minus P0)

	// ─────────────────────────────────────────────────────────────────────────────
	// UI State
	// ─────────────────────────────────────────────────────────────────────────────

	/** Whether the settings drawer is open */
	let showSettings = false;

	/** Maximum frequency for spectrogram display (Hz) */
	let maxFrequency = 5000;

	/** Start time for drag-to-select gesture */
	let selectionStartTime: number | null = null;

	// ─────────────────────────────────────────────────────────────────────────────
	// Recording State
	// ─────────────────────────────────────────────────────────────────────────────
	// Microphone recording uses the MediaRecorder API

	/** Whether currently recording from microphone */
	let isRecording = false;

	/** MediaRecorder instance for capturing audio */
	let mediaRecorder: MediaRecorder | null = null;

	/** Accumulated audio data chunks during recording */
	let recordedChunks: Blob[] = [];

	/** Elapsed recording time in seconds (for display) */
	let recordingTime = 0;

	/** Timer interval for updating recordingTime */
	let recordingTimer: ReturnType<typeof setInterval> | null = null;

	// ─────────────────────────────────────────────────────────────────────────────
	// Lifecycle
	// ─────────────────────────────────────────────────────────────────────────────

	onMount(() => {
		// Initialize the WASM acoustic analysis engine
		initWasm();
	});

	onDestroy(() => {
		// Clean up gesture handlers
		if (cleanupGestures) {
			cleanupGestures();
		}
		// Clean up recording resources
		if (recordingTimer) {
			clearInterval(recordingTimer);
		}
		if (mediaRecorder && isRecording) {
			mediaRecorder.stop();
		}
	});

	// ─────────────────────────────────────────────────────────────────────────────
	// Recording Functions
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Start recording audio from the device microphone.
	 *
	 * Uses MediaRecorder API with audio processing disabled for clean capture:
	 * - echoCancellation: false - preserve natural sound
	 * - noiseSuppression: false - don't filter out acoustic details
	 * - autoGainControl: false - maintain consistent amplitude
	 *
	 * Recording is saved as WebM format, then decoded and converted
	 * to Float64Array for acoustic analysis.
	 */
	async function startRecording() {
		try {
			// Request microphone access with processing disabled
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false
				}
			});

			// Initialize recording state
			recordedChunks = [];
			mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

			// Collect audio data as it becomes available
			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) {
					recordedChunks.push(e.data);
				}
			};

			// Process recording when stopped
			mediaRecorder.onstop = async () => {
				// Release microphone
				stream.getTracks().forEach(track => track.stop());

				// Convert recorded chunks to audio buffer
				const blob = new Blob(recordedChunks, { type: 'audio/webm' });
				await processRecordedAudio(blob);
			};

			// Start recording, collecting data every 100ms
			mediaRecorder.start(100);
			isRecording = true;
			recordingTime = 0;

			// Update recording time display
			recordingTimer = setInterval(() => {
				recordingTime += 0.1;
			}, 100);

		} catch (err) {
			console.error('Failed to start recording:', err);
			alert('Could not access microphone. Please allow microphone access.');
		}
	}

	/**
	 * Stop the current recording.
	 * This triggers mediaRecorder.onstop which processes the audio.
	 */
	function stopRecording() {
		if (mediaRecorder && isRecording) {
			mediaRecorder.stop();
			isRecording = false;

			if (recordingTimer) {
				clearInterval(recordingTimer);
				recordingTimer = null;
			}
		}
	}

	/**
	 * Process recorded audio blob and load it into the app.
	 *
	 * Converts the WebM blob to an AudioBuffer using Web Audio API,
	 * then extracts samples as Float64Array for acoustic analysis.
	 *
	 * @param blob - The recorded audio as a Blob
	 */
	async function processRecordedAudio(blob: Blob) {
		clearAnalysis();

		// Decode the WebM audio
		const arrayBuffer = await blob.arrayBuffer();
		const audioContext = new AudioContext();
		const decoded = await audioContext.decodeAudioData(arrayBuffer);

		// Convert to Float64Array (mono, first channel)
		const samples = new Float64Array(decoded.length);
		const channelData = decoded.getChannelData(0);
		for (let i = 0; i < decoded.length; i++) {
			samples[i] = channelData[i];
		}

		// Load into app stores
		audioBuffer.set(samples);
		sampleRate.set(decoded.sampleRate);
		fileName.set(`Recording ${new Date().toLocaleTimeString()}`);
		duration.set(decoded.length / decoded.sampleRate);

		// Set initial view to show full recording (max 10s visible)
		const dur = decoded.length / decoded.sampleRate;
		timeRange.set({ start: 0, end: Math.min(dur, 10) });
		cursorPosition.set(0);
		selection.set(null);

		// Run acoustic analysis (pitch, formants, etc.)
		runAnalysis().catch(e => console.error('Analysis failed:', e));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// File Loading
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Handle file input change event.
	 * Extracts the selected file and passes it to handleFile.
	 */
	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			handleFile(file);
		}
		input.value = ''; // Reset so same file can be selected again
	}

	/**
	 * Load an audio file and prepare it for analysis.
	 *
	 * Decodes the audio using Web Audio API and converts to Float64Array
	 * format required by the WASM acoustic analysis engine.
	 *
	 * @param file - The audio file to load
	 */
	async function handleFile(file: File) {
		clearAnalysis();

		// Decode audio file
		const arrayBuffer = await file.arrayBuffer();
		const audioContext = new AudioContext();
		const decoded = await audioContext.decodeAudioData(arrayBuffer);

		// Convert to Float64Array (mono, first channel)
		const samples = new Float64Array(decoded.length);
		const channelData = decoded.getChannelData(0);
		for (let i = 0; i < decoded.length; i++) {
			samples[i] = channelData[i];
		}

		// Load into app stores
		audioBuffer.set(samples);
		sampleRate.set(decoded.sampleRate);
		fileName.set(file.name);
		duration.set(decoded.length / decoded.sampleRate);

		// Set initial view (max 10s visible)
		const dur = decoded.length / decoded.sampleRate;
		timeRange.set({ start: 0, end: Math.min(dur, 10) });
		cursorPosition.set(0);
		selection.set(null);

		// Run acoustic analysis
		runAnalysis().catch(e => console.error('Analysis failed:', e));
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Touch Gesture Handling
	// ─────────────────────────────────────────────────────────────────────────────

	// Attach gesture handlers when container and audio are ready
	$: if (gestureContainer && $audioBuffer) {
		attachGestures();
	}

	/**
	 * Set up touch gesture handlers for the viewer.
	 *
	 * Gestures supported:
	 * - Tap: Position cursor at tap location
	 * - Single-finger drag: Select a time region
	 * - Two-finger drag: Pan the view
	 * - Pinch: Zoom in/out centered on gesture
	 */
	function attachGestures() {
		// Clean up previous handlers
		if (cleanupGestures) {
			cleanupGestures();
		}

		if (!gestureContainer || !$audioBuffer) return;

		const audioDuration = $audioBuffer.length / $sampleRate;

		const callbacks: GestureCallbacks = {
			/**
			 * Handle two-finger pan gesture.
			 * Shifts the visible time range by deltaTime.
			 */
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

			/**
			 * Handle pinch-to-zoom gesture.
			 * Zooms centered on the gesture's center point.
			 */
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

			/**
			 * Handle tap gesture.
			 * Positions cursor at tap location and clears selection.
			 */
			onTap: (time: number) => {
				cursorPosition.set(time);
				selection.set(null);
			},

			/**
			 * Handle start of single-finger drag (selection).
			 */
			onSelectionStart: (time: number) => {
				selectionStartTime = time;
				cursorPosition.set(time);
				selection.set(null);
			},

			/**
			 * Handle drag movement (updates selection).
			 */
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

			/**
			 * Handle end of drag (selection complete).
			 */
			onSelectionEnd: () => {
				selectionStartTime = null;
			},

			/**
			 * Convert screen X coordinate to time.
			 * Accounts for the 45px margins on each side of the plot area.
			 */
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

			/**
			 * Get the currently visible time duration.
			 */
			getVisibleDuration: () => {
				const { start, end } = $timeRange;
				return end - start;
			}
		};

		cleanupGestures = attachGestureHandlers(gestureContainer, callbacks);
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Playback Controls
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Toggle audio playback.
	 * - If playing: stop
	 * - If selection exists: play selection
	 * - Otherwise: play visible window
	 */
	function togglePlay() {
		if ($isPlaying) {
			stop();
		} else if ($selection) {
			playRange($selection.start, $selection.end);
		} else {
			playVisible();
		}
	}

	/** Close the settings drawer. */
	function closeSettings() {
		showSettings = false;
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Value Formatting Helpers
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Format time value for display (3 decimal places).
	 * @param seconds - Time in seconds
	 * @returns Formatted string like "1.234"
	 */
	function formatTime(seconds: number): string {
		return seconds.toFixed(3);
	}

	/**
	 * Format frequency value for display (rounded Hz).
	 * @param hz - Frequency in Hz, or null if unavailable
	 * @returns Formatted string like "440" or "-" if null
	 */
	function formatHz(hz: number | null): string {
		if (hz === null) return '-';
		return Math.round(hz).toString();
	}

	/**
	 * Format decibel value for display (1 decimal place).
	 * @param db - Value in dB, or null if unavailable
	 * @returns Formatted string like "75.3" or "-" if null
	 */
	function formatDb(db: number | null): string {
		if (db === null) return '-';
		return db.toFixed(1);
	}

	// ─────────────────────────────────────────────────────────────────────────────
	// Reactive Computations
	// ─────────────────────────────────────────────────────────────────────────────

	/**
	 * Computed acoustic values at the current cursor position.
	 * Updates reactively when cursor moves or analysis results change.
	 * Returns null if no analysis available.
	 */
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

<!-- ═══════════════════════════════════════════════════════════════════════════
     HEAD CONFIGURATION
     Mobile viewport settings and PWA-like appearance
     ═══════════════════════════════════════════════════════════════════════════ -->
<svelte:head>
	<!-- Prevent user zoom, fill notched phone screens -->
	<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
	<!-- Enable fullscreen mode when added to home screen -->
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<!-- Status bar styling for iOS -->
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>

<!-- ═══════════════════════════════════════════════════════════════════════════
     MAIN LAYOUT
     Fixed viewport container with safe area insets for notched phones
     ═══════════════════════════════════════════════════════════════════════════ -->
<main class="viewer-main">
	<!-- ─────────────────────────────────────────────────────────────────────────
	     STATE 1: WASM Loading
	     ─────────────────────────────────────────────────────────────────────────── -->
	{#if !$wasmReady}
		<div class="loading">Loading acoustic analysis engine...</div>

	<!-- ─────────────────────────────────────────────────────────────────────────
	     STATE 2: Start Screen (No Audio Loaded)
	     Shows Load File and Record buttons, or recording indicator
	     ─────────────────────────────────────────────────────────────────────────── -->
	{:else if !$audioBuffer}
		<div class="start-screen">
			{#if isRecording}
				<div class="recording-indicator">
					<div class="recording-pulse"></div>
					<span class="recording-time">{recordingTime.toFixed(1)}s</span>
				</div>
				<button class="stop-record-btn" on:click={stopRecording}>
					<svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
						<rect x="6" y="6" width="12" height="12" rx="2"/>
					</svg>
					<span>Stop</span>
				</button>
			{:else}
				<h2>Ozen Viewer</h2>
				<div class="start-buttons">
					<label class="start-btn load-btn">
						<input type="file" accept="audio/*" on:change={handleFileInput} />
						<svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
							<path d="M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z"/>
						</svg>
						<span>Load File</span>
					</label>
					<button class="start-btn record-btn" on:click={startRecording}>
						<svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
							<circle cx="12" cy="12" r="8"/>
						</svg>
						<span>Record</span>
					</button>
				</div>
				<p class="start-hint">Load an audio file or record from microphone</p>
			{/if}
		</div>

	<!-- ─────────────────────────────────────────────────────────────────────────
	     STATE 3: Main Viewer (Audio Loaded)
	     Header, values bar, visualization panels, FAB play button, settings drawer
	     ─────────────────────────────────────────────────────────────────────────── -->
	{:else}
		<!-- Header: filename, analysis progress, settings toggle -->
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

		<!-- Values Bar: Compact two-row display of acoustic measurements at cursor
		     Row 1: Time, Pitch, Intensity, HNR, Selection duration
		     Row 2: Formants (F1-F4), Center of Gravity -->
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

		<!-- Floating Action Button (FAB) for Play/Pause
		     - Bottom-right position with safe area offset
		     - Blue when ready to play, red when playing -->
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
	/* ═══════════════════════════════════════════════════════════════════════════
	   MAIN CONTAINER
	   Fixed viewport with safe area insets for notched phones (iPhone X, etc.)
	   ═══════════════════════════════════════════════════════════════════════════ */
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

	/* ═══════════════════════════════════════════════════════════════════════════
	   START SCREEN
	   Centered layout with Load File / Record buttons
	   ═══════════════════════════════════════════════════════════════════════════ */
	.start-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 2rem;
		text-align: center;
	}

	.start-screen h2 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 2rem 0;
		color: var(--color-text);
	}

	.start-buttons {
		display: flex;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.start-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		width: 120px;
		height: 120px;
		border: 2px solid var(--color-border);
		border-radius: 16px;
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		transition: all 0.2s;
	}

	.start-btn:hover {
		border-color: var(--color-primary);
		background: rgba(74, 158, 255, 0.1);
	}

	.start-btn:active {
		transform: scale(0.95);
	}

	.start-btn input[type="file"] {
		display: none;
	}

	.start-btn span {
		font-size: 0.9rem;
		font-weight: 500;
	}

	.load-btn {
		color: var(--color-primary);
	}

	.load-btn svg {
		color: var(--color-primary);
	}

	.record-btn {
		color: #ef4444;
		border: none;
	}

	.record-btn svg {
		color: #ef4444;
	}

	.record-btn:hover {
		background: rgba(239, 68, 68, 0.1);
		border-color: #ef4444;
	}

	.start-hint {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	/* ═══════════════════════════════════════════════════════════════════════════
	   RECORDING INDICATOR
	   Pulsing red circle and timer display while recording
	   ═══════════════════════════════════════════════════════════════════════════ */
	.recording-indicator {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.recording-pulse {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: #ef4444;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { transform: scale(1); opacity: 1; }
		50% { transform: scale(1.1); opacity: 0.8; }
	}

	.recording-time {
		font-size: 2rem;
		font-weight: 600;
		font-family: monospace;
		color: #ef4444;
	}

	.stop-record-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 2rem;
		border: none;
		border-radius: 12px;
		background: #ef4444;
		color: white;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.stop-record-btn:hover {
		background: #dc2626;
	}

	.stop-record-btn:active {
		transform: scale(0.95);
	}

	/* ═══════════════════════════════════════════════════════════════════════════
	   VIEWER HEADER
	   Filename display and settings toggle
	   ═══════════════════════════════════════════════════════════════════════════ */
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

	/* ═══════════════════════════════════════════════════════════════════════════
	   VALUES BAR
	   Compact acoustic measurement display in two rows
	   ═══════════════════════════════════════════════════════════════════════════ */
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

	/* ═══════════════════════════════════════════════════════════════════════════
	   VISUALIZATION PANELS
	   Waveform, Spectrogram, and Time Axis containers
	   ═══════════════════════════════════════════════════════════════════════════ */
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

	/* Hide desktop controls from Spectrogram/Waveform components
	   Mobile viewer uses FAB for playback and touch gestures for zoom
	   :global() is required to target elements inside child components */
	:global(.play-selection-btn),
	:global(.zoom-controls) {
		display: none !important;
	}

	.time-axis-panel {
		height: 20px;
		flex-shrink: 0;
	}

	/* ═══════════════════════════════════════════════════════════════════════════
	   FLOATING ACTION BUTTON (FAB)
	   Circular play/pause button positioned at bottom-right
	   ═══════════════════════════════════════════════════════════════════════════ */
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

	/* ═══════════════════════════════════════════════════════════════════════════
	   SETTINGS DRAWER
	   Slide-in panel from right edge with overlay toggles
	   ═══════════════════════════════════════════════════════════════════════════ */
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

	/* ═══════════════════════════════════════════════════════════════════════════
	   RESPONSIVE ADJUSTMENTS
	   Landscape mode: Compact layout for limited vertical space
	   Touch devices: Larger touch targets (44px minimum)
	   ═══════════════════════════════════════════════════════════════════════════ */
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
