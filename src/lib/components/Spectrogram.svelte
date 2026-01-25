<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { audioBuffer, sampleRate } from '$lib/stores/audio';
	import { timeRange, cursorPosition, selection, hoverPosition } from '$lib/stores/view';
	import { createSound, getWasm, wasmReady, computeSpectrogram as computeSpec, getSpectrogramInfo } from '$lib/wasm/acoustic';
	import { analysisResults } from '$lib/stores/analysis';
	import { config } from '$lib/stores/config';
	import { playRange, isPlaying, stop } from '$lib/audio/player';
	import {
		dataPoints,
		hoveredPointId,
		draggingPointId,
		addDataPoint,
		removeDataPoint,
		moveDataPoint,
		getPointAtPosition
	} from '$lib/stores/dataPoints';
	import { saveUndo } from '$lib/stores/undoManager';
	import type { SpectrogramData, DataPoint } from '$lib/types';

	// Overlay visibility props
	export let showPitch = true;
	export let showFormants = true;
	export let showIntensity = false;
	export let showHNR = false;
	export let showCoG = false;
	export let showSpectralTilt = false;
	export let showA1P0 = false;
	export let showDataPoints = true;
	export let maxFreq = 5000;

	let container: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let width = 0;
	let height = 0;
	let resizeObserver: ResizeObserver;

	// Cached spectrogram data (full resolution for entire audio)
	let spectrogramData: SpectrogramData | null = null;
	let spectrogramImageData: ImageData | null = null;
	let spectrogramCanvas: HTMLCanvasElement | null = null;

	// Zoomed spectrogram cache (high resolution for visible region)
	let zoomedSpectrogramCanvas: HTMLCanvasElement | null = null;
	let zoomedTimeRange: { start: number; end: number } | null = null;
	let zoomDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Interaction state
	let isSelecting = false;
	let selectionStart = 0;

	// Data point dragging state
	let isDraggingPoint = false;
	let dragPointId: number | null = null;

	// Data point context menu state
	let pointContextMenu: { x: number; y: number; pointId: number } | null = null;

	// Display settings
	const dynamicRange = 70; // dB
	const pitchFloor = 0;
	const pitchCeiling = 500;

	// Axis margins
	const leftMargin = 45;
	const rightMargin = 45;

	// Track the maxFreq used for the current spectrogram
	let spectrogramMaxFreq: number | null = null;

	$: if ($audioBuffer && $wasmReady && (!spectrogramData || maxFreq !== spectrogramMaxFreq)) {
		computeSpectrogram();
	}

	// Reactive draw trigger - all dependencies must be in the expression
	// We create a dependency array that Svelte will track
	$: drawDeps = [
		ctx,
		spectrogramCanvas,
		zoomedSpectrogramCanvas,
		width,
		$timeRange,
		$selection,
		$cursorPosition,
		$hoverPosition,
		$analysisResults,
		$dataPoints,
		$hoveredPointId,
		$draggingPointId,
		maxFreq,
		showPitch,
		showFormants,
		showIntensity,
		showHNR,
		showCoG,
		showSpectralTilt,
		showA1P0,
		showDataPoints
	];

	$: if (drawDeps && ctx && spectrogramCanvas && width > 0) {
		draw();
	}

	// Debounced zoom spectrogram regeneration
	// When zoomed in significantly, regenerate at higher resolution after user stops zooming
	$: if ($timeRange && spectrogramData && $audioBuffer && $wasmReady && plotWidth > 0) {
		scheduleZoomedSpectrogram($timeRange.start, $timeRange.end);
	}

	function scheduleZoomedSpectrogram(start: number, end: number) {
		// Clear any pending regeneration
		if (zoomDebounceTimer) {
			clearTimeout(zoomDebounceTimer);
		}

		// Check if we're zoomed in enough to benefit from regeneration
		if (!spectrogramData) return;
		const fullDuration = spectrogramData.timeMax - spectrogramData.timeMin;
		const visibleDuration = end - start;
		const zoomRatio = fullDuration / visibleDuration;

		// Only regenerate if zoomed in at least 2x and view changed significantly
		if (zoomRatio < 2) {
			zoomedSpectrogramCanvas = null;
			zoomedTimeRange = null;
			return;
		}

		// Check if current zoomed cache is still valid (within 10% of current view)
		if (zoomedTimeRange) {
			const overlap = Math.min(end, zoomedTimeRange.end) - Math.max(start, zoomedTimeRange.start);
			const coverage = overlap / visibleDuration;
			if (coverage > 0.9) return; // Cache is still good enough
		}

		// Schedule regeneration after 300ms of no changes
		zoomDebounceTimer = setTimeout(() => {
			computeZoomedSpectrogram(start, end);
		}, 300);
	}

	async function computeZoomedSpectrogram(start: number, end: number) {
		if (!$audioBuffer || !$wasmReady || !spectrogramData) return;

		const wasm = getWasm();

		// Add small padding to avoid edge artifacts
		const padding = (end - start) * 0.05;
		const paddedStart = Math.max(0, start - padding);
		const paddedEnd = Math.min($audioBuffer.length / $sampleRate, end + padding);

		// Extract the visible portion of audio
		const startSample = Math.floor(paddedStart * $sampleRate);
		const endSample = Math.ceil(paddedEnd * $sampleRate);
		const visibleSamples = $audioBuffer.slice(startSample, endSample);

		const sound = new wasm.Sound(visibleSamples, $sampleRate);

		try {
			// Compute higher resolution spectrogram for visible region
			// Use smaller time step for better resolution when zoomed
			const timeStep = Math.max(0.001, (paddedEnd - paddedStart) / (plotWidth * 2));
			const spec = sound.to_spectrogram(0.005, maxFreq, timeStep, 20.0, 'gaussian');

			const zoomedData: SpectrogramData = {
				values: spec.values(),
				freqMin: spec.freq_min,
				freqMax: spec.freq_max,
				timeMin: paddedStart,
				timeMax: paddedStart + (spec.num_frames - 1) * spec.time_step,
				nFreqs: spec.num_freq_bins,
				nTimes: spec.num_frames
			};

			// Create zoomed canvas
			const result = createSpectrogramImage(zoomedData);
			zoomedSpectrogramCanvas = result.canvas;
			zoomedTimeRange = { start: paddedStart, end: paddedEnd };

			spec.free();

			// Trigger redraw with new zoomed spectrogram
			draw();
		} finally {
			sound.free();
		}
	}

	// Computed plot area
	$: plotWidth = Math.max(0, width - leftMargin - rightMargin);
	$: plotLeft = leftMargin;
	$: plotRight = width - rightMargin;

	onMount(() => {
		ctx = canvas.getContext('2d');
		resizeObserver = new ResizeObserver(entries => {
			const rect = entries[0].contentRect;
			width = rect.width;
			height = rect.height;
			canvas.width = width * devicePixelRatio;
			canvas.height = height * devicePixelRatio;
			if (ctx) {
				ctx.scale(devicePixelRatio, devicePixelRatio);
			}
			draw();
		});
		resizeObserver.observe(container);
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		if (zoomDebounceTimer) {
			clearTimeout(zoomDebounceTimer);
		}
	});

	async function computeSpectrogram() {
		if (!$audioBuffer || !$wasmReady) return;

		const wasm = getWasm();
		const sound = new wasm.Sound($audioBuffer, $sampleRate);

		try {
			// Use abstraction layer for backend compatibility
			const spec = computeSpec(sound, 0.005, maxFreq, 0.002, 20.0);
			const info = getSpectrogramInfo(spec);

			spectrogramData = {
				values: info.values,
				freqMin: info.freqMin,
				freqMax: info.freqMax,
				timeMin: info.timeMin,
				timeMax: info.timeMax,
				nFreqs: info.nFreqs,
				nTimes: info.nTimes
			};

			// Track the maxFreq used for this spectrogram
			spectrogramMaxFreq = maxFreq;

			// Clear zoomed cache since base spectrogram changed
			zoomedSpectrogramCanvas = null;
			zoomedTimeRange = null;

			// Pre-compute full ImageData and cached canvas
			// Assign spectrogramCanvas at top level so Svelte can track the change
			const result = createSpectrogramImage(spectrogramData);
			spectrogramImageData = result.imageData;
			spectrogramCanvas = result.canvas;

			spec.free();

			// Ensure Svelte processes state changes
			await tick();

			// Use requestAnimationFrame to ensure browser has completed layout
			// This fixes the issue where draw() is called before canvas has dimensions
			const tryDraw = () => {
				if (width > 0 && ctx) {
					draw();
				} else {
					// Canvas not ready yet, try again next frame
					requestAnimationFrame(tryDraw);
				}
			};
			requestAnimationFrame(tryDraw);
		} finally {
			sound.free();
		}
	}

	function createSpectrogramImage(data: SpectrogramData): { imageData: ImageData; canvas: HTMLCanvasElement } {
		const { values, nFreqs, nTimes } = data;
		const imageData = new ImageData(nTimes, nFreqs);

		// Find max value for normalization
		let maxVal = -Infinity;
		for (let i = 0; i < values.length; i++) {
			if (values[i] > maxVal) maxVal = values[i];
		}

		// Convert to dB and apply colormap
		const maxDb = 10 * Math.log10(maxVal + 1e-10);

		for (let t = 0; t < nTimes; t++) {
			for (let f = 0; f < nFreqs; f++) {
				const val = values[f * nTimes + t];
				const db = 10 * Math.log10(val + 1e-10);
				const normalized = Math.max(0, Math.min(1, (db - (maxDb - dynamicRange)) / dynamicRange));

				// Grayscale colormap (Praat style: white = silence, black = loud)
				const gray = Math.round(255 * (1 - normalized));
				const idx = ((nFreqs - 1 - f) * nTimes + t) * 4;
				imageData.data[idx] = gray;
				imageData.data[idx + 1] = gray;
				imageData.data[idx + 2] = gray;
				imageData.data[idx + 3] = 255;
			}
		}

		// Pre-render to a cached canvas for fast drawing
		const canvas = document.createElement('canvas');
		canvas.width = nTimes;
		canvas.height = nFreqs;
		const tempCtx = canvas.getContext('2d')!;
		tempCtx.putImageData(imageData, 0, 0);

		return { imageData, canvas };
	}

	function draw() {
		if (!ctx || !spectrogramData || !spectrogramCanvas || width === 0) return;

		const { start, end } = $timeRange;
		const cfg = $config.colors;

		// Clear canvas
		ctx.fillStyle = getComputedStyle(container).getPropertyValue('--color-bg').trim() || '#1a1a1a';
		ctx.fillRect(0, 0, width, height);

		// Draw left Y-axis background
		ctx.fillStyle = getComputedStyle(container).getPropertyValue('--color-surface').trim() || '#2a2a2a';
		ctx.fillRect(0, 0, leftMargin, height);

		// Draw right Y-axis background
		ctx.fillRect(width - rightMargin, 0, rightMargin, height);

		// Check if we have a valid zoomed spectrogram for the current view
		const useZoomed = zoomedSpectrogramCanvas && zoomedTimeRange &&
			start >= zoomedTimeRange.start && end <= zoomedTimeRange.end;

		if (useZoomed && zoomedSpectrogramCanvas && zoomedTimeRange) {
			// Use high-resolution zoomed spectrogram
			const zCanvas = zoomedSpectrogramCanvas;
			const zStart = zoomedTimeRange.start;
			const zEnd = zoomedTimeRange.end;
			const zWidth = zCanvas.width;
			const zHeight = zCanvas.height;

			const srcX = Math.floor(((start - zStart) / (zEnd - zStart)) * zWidth);
			const srcWidth = Math.ceil(((end - start) / (zEnd - zStart)) * zWidth);

			ctx.imageSmoothingEnabled = true;
			ctx.drawImage(
				zCanvas,
				Math.max(0, srcX), 0, Math.min(srcWidth, zWidth - srcX), zHeight,
				leftMargin, 0, plotWidth, height
			);
		} else {
			// Use full spectrogram (may be pixelated when zoomed)
			const { timeMin, timeMax, nTimes, nFreqs, freqMax: specFreqMax } = spectrogramData;
			const srcX = Math.floor(((start - timeMin) / (timeMax - timeMin)) * nTimes);
			const srcWidth = Math.ceil(((end - start) / (timeMax - timeMin)) * nTimes);

			// Calculate how much of the spectrogram height to show based on maxFreq
			const freqRatio = Math.min(1, maxFreq / specFreqMax);
			const srcFreqBins = Math.floor(nFreqs * freqRatio);
			const srcY = nFreqs - srcFreqBins; // Start from top (high freq in image is at top after flip)

			// Draw the visible portion scaled to plot area (using cached canvas)
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(
				spectrogramCanvas,
				Math.max(0, srcX), srcY, Math.min(srcWidth, nTimes - srcX), srcFreqBins,
				leftMargin, 0, plotWidth, height
			);
		}

		// Draw selection if present
		if ($selection) {
			const selStart = Math.max($selection.start, start);
			const selEnd = Math.min($selection.end, end);
			if (selEnd > selStart) {
				const x1 = timeToXPlot(selStart, start, end);
				const x2 = timeToXPlot(selEnd, start, end);
				ctx.fillStyle = cfg.selection.fill;
				ctx.fillRect(x1, 0, x2 - x1, height);
			}
		}

		// Draw hover cursor (dashed red line)
		if ($hoverPosition !== null) {
			const hoverX = timeToXPlot($hoverPosition, start, end);
			if (hoverX >= leftMargin && hoverX <= plotRight) {
				ctx.strokeStyle = cfg.cursor;
				ctx.lineWidth = 1;
				ctx.setLineDash([4, 4]);
				ctx.beginPath();
				ctx.moveTo(hoverX, 0);
				ctx.lineTo(hoverX, height);
				ctx.stroke();
				ctx.setLineDash([]);
			}
		}

		// Draw cursor (red, Praat style)
		const cursorX = timeToXPlot($cursorPosition, start, end);
		if (cursorX >= leftMargin && cursorX <= plotRight) {
			ctx.strokeStyle = cfg.cursor;
			ctx.lineWidth = cfg.cursorWidth;
			ctx.beginPath();
			ctx.moveTo(cursorX, 0);
			ctx.lineTo(cursorX, height);
			ctx.stroke();
		}

		// Draw overlays
		if ($analysisResults) {
			if (showPitch) {
				drawPitchOverlay(start, end);
			}
			if (showFormants) {
				drawFormantsOverlay(start, end);
			}
			if (showIntensity) {
				drawIntensityOverlay(start, end);
			}
			if (showHNR) {
				drawHNROverlay(start, end);
			}
			if (showCoG) {
				drawCoGOverlay(start, end);
			}
			if (showSpectralTilt) {
				drawSpectralTiltOverlay(start, end);
			}
			if (showA1P0) {
				drawA1P0Overlay(start, end);
			}
		}

		// Draw data points
		if (showDataPoints) {
			drawDataPointsOverlay(start, end);
		}

		// Draw left Y-axis (Frequency)
		drawFrequencyAxis();

		// Draw right Y-axis (Pitch) if pitch is shown
		if (showPitch) {
			drawPitchAxis();
		}
	}

	function drawFrequencyAxis() {
		if (!ctx) return;

		ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
		ctx.font = '10px sans-serif';
		ctx.textAlign = 'right';

		// Generate frequency labels based on maxFreq
		const step = maxFreq <= 5000 ? 1000 : maxFreq <= 7500 ? 1500 : 2000;
		for (let freq = 0; freq <= maxFreq; freq += step) {
			const y = height - (freq / maxFreq) * height;
			const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
			ctx.fillText(label, leftMargin - 4, y + 3);

			// Draw tick mark
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(leftMargin - 2, y);
			ctx.lineTo(leftMargin, y);
			ctx.stroke();
		}

		// Axis label
		ctx.save();
		ctx.translate(12, height / 2);
		ctx.rotate(-Math.PI / 2);
		ctx.textAlign = 'center';
		ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
		ctx.font = '9px sans-serif';
		ctx.fillText('Frequency (Hz)', 0, 0);
		ctx.restore();
	}

	function drawPitchAxis() {
		if (!ctx) return;

		ctx.fillStyle = '#60a5fa';
		ctx.font = '10px sans-serif';
		ctx.textAlign = 'left';

		// Pitch range: 0-500 Hz
		const pitchStep = 100;
		for (let pitch = 0; pitch <= pitchCeiling; pitch += pitchStep) {
			const y = pitchToY(pitch);
			ctx.fillText(`${pitch}`, width - rightMargin + 4, y + 3);

			// Draw tick mark
			ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(width - rightMargin, y);
			ctx.lineTo(width - rightMargin + 2, y);
			ctx.stroke();
		}

		// Axis label
		ctx.save();
		ctx.translate(width - 8, height / 2);
		ctx.rotate(Math.PI / 2);
		ctx.textAlign = 'center';
		ctx.fillStyle = 'rgba(96, 165, 250, 0.6)';
		ctx.font = '9px sans-serif';
		ctx.fillText('Pitch (Hz)', 0, 0);
		ctx.restore();
	}

	function drawPitchOverlay(start: number, end: number) {
		if (!ctx || !$analysisResults) return;

		const { times, pitch } = $analysisResults;
		const cfg = $config.colors;

		ctx.strokeStyle = cfg.pitch;
		ctx.lineWidth = cfg.pitchWidth;
		ctx.beginPath();

		let started = false;

		for (let i = 0; i < times.length; i++) {
			const t = times[i];
			const f0 = pitch[i];

			if (t < start || t > end) continue;
			if (f0 === null || f0 <= pitchFloor || f0 > pitchCeiling) {
				started = false;
				continue;
			}

			const x = timeToXPlot(t, start, end);
			const y = pitchToY(f0);

			if (!started) {
				ctx.moveTo(x, y);
				started = true;
			} else {
				ctx.lineTo(x, y);
			}
		}

		ctx.stroke();

		// Draw pitch dots for better visibility
		ctx.fillStyle = cfg.pitch;
		for (let i = 0; i < times.length; i++) {
			const t = times[i];
			const f0 = pitch[i];

			if (t < start || t > end) continue;
			if (f0 === null || f0 <= pitchFloor || f0 > pitchCeiling) continue;

			const x = timeToXPlot(t, start, end);
			const y = pitchToY(f0);

			ctx.beginPath();
			ctx.arc(x, y, 2, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	function drawFormantsOverlay(start: number, end: number) {
		if (!ctx || !$analysisResults) return;

		const { times, formants } = $analysisResults;
		const cfg = $config.colors.formant;
		const formantColors = [cfg.f1, cfg.f2, cfg.f3, cfg.f4];
		const formantArrays = [formants.f1, formants.f2, formants.f3, formants.f4];

		for (let f = 0; f < 4; f++) {
			const fValues = formantArrays[f];
			ctx.fillStyle = formantColors[f];

			for (let i = 0; i < times.length; i++) {
				const t = times[i];
				const freq = fValues[i];

				if (t < start || t > end) continue;
				if (freq === null || freq > maxFreq) continue;

				const x = timeToXPlot(t, start, end);
				const y = freqToY(freq);

				ctx.beginPath();
				ctx.arc(x, y, cfg.size, 0, Math.PI * 2);
				ctx.fill();
			}
		}
	}

	function drawIntensityOverlay(start: number, end: number) {
		if (!ctx || !$analysisResults) return;

		const { times, intensity } = $analysisResults;

		ctx.strokeStyle = '#4ade80';
		ctx.lineWidth = 2;
		ctx.beginPath();

		let started = false;
		const minInt = 30;
		const maxInt = 90;

		for (let i = 0; i < times.length; i++) {
			const t = times[i];
			const int = intensity[i];

			if (t < start || t > end) continue;
			if (int === null) {
				started = false;
				continue;
			}

			const x = timeToXPlot(t, start, end);
			const normalized = (int - minInt) / (maxInt - minInt);
			const y = height - normalized * height * 0.8 - height * 0.1;

			if (!started) {
				ctx.moveTo(x, y);
				started = true;
			} else {
				ctx.lineTo(x, y);
			}
		}

		ctx.stroke();
	}

	function drawHNROverlay(start: number, end: number) {
		if (!ctx || !$analysisResults) return;

		const { times, harmonicity } = $analysisResults;

		ctx.strokeStyle = '#fbbf24';
		ctx.lineWidth = 2;
		ctx.beginPath();

		let started = false;
		const minHNR = -10;
		const maxHNR = 40;

		for (let i = 0; i < times.length; i++) {
			const t = times[i];
			const hnr = harmonicity[i];

			if (t < start || t > end) continue;
			if (hnr === null) {
				started = false;
				continue;
			}

			const x = timeToXPlot(t, start, end);
			const normalized = (hnr - minHNR) / (maxHNR - minHNR);
			const y = height - normalized * height * 0.8 - height * 0.1;

			if (!started) {
				ctx.moveTo(x, y);
				started = true;
			} else {
				ctx.lineTo(x, y);
			}
		}

		ctx.stroke();
	}

	function drawCoGOverlay(start: number, end: number) {
		if (!ctx || !$analysisResults || !$analysisResults.cog) return;

		const { times, cog } = $analysisResults;

		ctx.fillStyle = '#c084fc';

		for (let i = 0; i < times.length; i++) {
			const t = times[i];
			const cogVal = cog[i];

			if (t < start || t > end) continue;
			if (cogVal === null || cogVal > maxFreq) continue;

			const x = timeToXPlot(t, start, end);
			const y = freqToY(cogVal);

			ctx.beginPath();
			ctx.arc(x, y, 2.5, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	function drawSpectralTiltOverlay(start: number, end: number) {
		if (!ctx || !$analysisResults || !$analysisResults.spectralTilt) return;

		const { times, spectralTilt } = $analysisResults;

		ctx.strokeStyle = '#22d3ee';
		ctx.lineWidth = 2;
		ctx.beginPath();

		let started = false;
		// Spectral tilt is low_band - high_band in dB, typically positive for speech (0-40 dB)
		const minTilt = 0;
		const maxTilt = 40;

		for (let i = 0; i < times.length; i++) {
			const t = times[i];
			const tilt = spectralTilt[i];

			if (t < start || t > end) continue;
			if (tilt === null) {
				started = false;
				continue;
			}

			const x = timeToXPlot(t, start, end);
			const normalized = (tilt - minTilt) / (maxTilt - minTilt);
			const y = height - normalized * height * 0.8 - height * 0.1;

			if (!started) {
				ctx.moveTo(x, y);
				started = true;
			} else {
				ctx.lineTo(x, y);
			}
		}

		ctx.stroke();
	}

	function drawA1P0Overlay(start: number, end: number) {
		if (!ctx || !$analysisResults || !$analysisResults.a1p0) return;

		const { times, a1p0 } = $analysisResults;

		ctx.strokeStyle = '#fb7185';
		ctx.lineWidth = 2;
		ctx.beginPath();

		let started = false;
		// A1-P0 is typically in range -20 to +20 dB
		const minA1P0 = -20;
		const maxA1P0 = 20;

		for (let i = 0; i < times.length; i++) {
			const t = times[i];
			const val = a1p0[i];

			if (t < start || t > end) continue;
			if (val === null) {
				started = false;
				continue;
			}

			const x = timeToXPlot(t, start, end);
			const normalized = (val - minA1P0) / (maxA1P0 - minA1P0);
			const y = height - normalized * height * 0.8 - height * 0.1;

			if (!started) {
				ctx.moveTo(x, y);
				started = true;
			} else {
				ctx.lineTo(x, y);
			}
		}

		ctx.stroke();
	}

	function drawDataPointsOverlay(start: number, end: number) {
		if (!ctx) return;

		const points = $dataPoints;

		for (const point of points) {
			if (point.time < start || point.time > end) continue;

			const x = timeToXPlot(point.time, start, end);
			const y = freqToY(point.frequency);
			const isHovered = $hoveredPointId === point.id;

			// Draw vertical line
			ctx.strokeStyle = isHovered ? '#ff6b6b' : '#ffcc00';
			ctx.lineWidth = isHovered ? 2 : 1;
			ctx.setLineDash([3, 3]);
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			ctx.stroke();
			ctx.setLineDash([]);

			// Draw marker dot at the click position
			ctx.fillStyle = isHovered ? '#ff6b6b' : '#ffcc00';
			ctx.beginPath();
			ctx.arc(x, y, isHovered ? 6 : 4, 0, Math.PI * 2);
			ctx.fill();

			// Draw outline
			ctx.strokeStyle = '#000';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(x, y, isHovered ? 6 : 4, 0, Math.PI * 2);
			ctx.stroke();

			// Draw point ID label
			ctx.fillStyle = '#ffcc00';
			ctx.font = '10px sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText(`P${point.id}`, x, 12);
		}
	}

	function freqToY(freq: number): number {
		return height - (freq / maxFreq) * height;
	}

	function yToFreq(y: number): number {
		return (1 - y / height) * maxFreq;
	}

	function pitchToY(pitch: number): number {
		// Pitch uses its own scale (0-500 Hz)
		return height - ((pitch - pitchFloor) / (pitchCeiling - pitchFloor)) * height;
	}

	function timeToX(time: number, start: number, end: number, w: number): number {
		return ((time - start) / (end - start)) * w;
	}

	function timeToXPlot(time: number, start: number, end: number): number {
		return leftMargin + ((time - start) / (end - start)) * plotWidth;
	}

	function xToTime(x: number, start: number, end: number, w: number): number {
		return start + (x / w) * (end - start);
	}

	function xPlotToTime(x: number, start: number, end: number): number {
		return start + ((x - leftMargin) / plotWidth) * (end - start);
	}

	function handleMouseDown(e: MouseEvent) {
		// Blur any active input (closes annotation text editors)
		if (document.activeElement instanceof HTMLInputElement) {
			document.activeElement.blur();
		}

		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		// Only start selection if clicking in the plot area
		if (x < leftMargin || x > width - rightMargin) return;

		const time = xPlotToTime(x, $timeRange.start, $timeRange.end);
		const freq = yToFreq(y);

		// Check if clicking on a data point to start dragging
		if (showDataPoints) {
			const point = getPointAtPosition(time, freq, 0.02, maxFreq * 0.05);
			if (point) {
				saveUndo(); // Save state before drag starts
				isDraggingPoint = true;
				dragPointId = point.id;
				draggingPointId.set(point.id);
				return;
			}
		}

		isSelecting = true;
		selectionStart = time;
		cursorPosition.set(time);
		selection.set(null);
	}

	function handleMouseMove(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		// Only track hover in plot area
		if (x < leftMargin || x > width - rightMargin) {
			hoverPosition.set(null);
			if (!isDraggingPoint) {
				hoveredPointId.set(null);
			}
			return;
		}

		const time = xPlotToTime(x, $timeRange.start, $timeRange.end);
		const freq = yToFreq(y);

		// Update hover position for coordinated cursor
		hoverPosition.set(time);

		// Handle data point dragging
		if (isDraggingPoint && dragPointId !== null) {
			// Update point position in real-time
			moveDataPoint(dragPointId, time, freq);
			return;
		}

		// Check if hovering over a data point
		if (showDataPoints) {
			const point = getPointAtPosition(time, freq, 0.02, maxFreq * 0.05);
			hoveredPointId.set(point?.id ?? null);
		}

		if (!isSelecting) return;

		if (Math.abs(time - selectionStart) > 0.001) {
			selection.set({
				start: Math.min(selectionStart, time),
				end: Math.max(selectionStart, time)
			});
		}
		cursorPosition.set(time);
	}

	function handleMouseUp() {
		if (isDraggingPoint) {
			isDraggingPoint = false;
			dragPointId = null;
			draggingPointId.set(null);
		}
		isSelecting = false;
	}

	function handleMouseLeave() {
		if (isDraggingPoint) {
			isDraggingPoint = false;
			dragPointId = null;
			draggingPointId.set(null);
		}
		isSelecting = false;
		hoverPosition.set(null);
		hoveredPointId.set(null);
	}

	function handleDoubleClick(e: MouseEvent) {
		if (!showDataPoints) return;

		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		// Only allow in plot area
		if (x < leftMargin || x > width - rightMargin) return;

		const time = xPlotToTime(x, $timeRange.start, $timeRange.end);
		const freq = yToFreq(y);

		// Check if clicking on existing point (don't add new one)
		const existingPoint = getPointAtPosition(time, freq, 0.02, maxFreq * 0.05);
		if (existingPoint) return;

		// Add new data point
		addDataPoint(time, freq);
	}

	function handleContextMenu(e: MouseEvent) {
		if (!showDataPoints) return;

		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;

		// Only allow in plot area
		if (x < leftMargin || x > width - rightMargin) return;

		const time = xPlotToTime(x, $timeRange.start, $timeRange.end);
		const freq = yToFreq(y);

		// Check if right-clicking on a data point
		const point = getPointAtPosition(time, freq, 0.02, maxFreq * 0.05);
		if (point) {
			e.preventDefault();
			pointContextMenu = {
				x: e.clientX,
				y: e.clientY,
				pointId: point.id
			};
		}
	}

	function closePointContextMenu() {
		pointContextMenu = null;
	}

	function handleRemovePoint() {
		if (pointContextMenu) {
			removeDataPoint(pointContextMenu.pointId);
			pointContextMenu = null;
		}
	}

	function handleWheel(e: WheelEvent) {
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const time = xPlotToTime(x, $timeRange.start, $timeRange.end);
		const duration = $audioBuffer ? $audioBuffer.length / $sampleRate : 10;
		const { start, end } = $timeRange;
		const currentDuration = end - start;

		// Horizontal scroll (deltaX) = pan
		if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
			const panAmount = (e.deltaX / plotWidth) * currentDuration;
			let newStart = start + panAmount;
			let newEnd = end + panAmount;

			// Clamp to audio bounds
			if (newStart < 0) {
				newStart = 0;
				newEnd = currentDuration;
			}
			if (newEnd > duration) {
				newEnd = duration;
				newStart = duration - currentDuration;
			}

			timeRange.set({ start: newStart, end: newEnd });
			return;
		}

		// Vertical scroll (deltaY) = zoom
		const zoomFactor = e.deltaY > 0 ? 1.1 : 0.91;
		const newDuration = Math.max(0.01, Math.min(duration, currentDuration * zoomFactor));

		const ratio = (time - start) / currentDuration;
		const newStart = Math.max(0, time - ratio * newDuration);
		const newEnd = Math.min(duration, newStart + newDuration);

		timeRange.set({
			start: Math.max(0, newEnd - newDuration),
			end: newEnd
		});
	}

	// Calculate play button position for selection
	$: playButtonX = $selection && width > 0
		? timeToXPlot(Math.max($selection.start, $timeRange.start), $timeRange.start, $timeRange.end)
		: 0;

	function handlePlaySelection() {
		if ($selection) {
			if ($isPlaying) {
				stop();
			} else {
				playRange($selection.start, $selection.end);
			}
		}
	}

	function zoomIn() {
		const duration = $audioBuffer ? $audioBuffer.length / $sampleRate : 10;
		const { start, end } = $timeRange;
		const currentDuration = end - start;
		const center = (start + end) / 2;
		const newDuration = Math.max(0.01, currentDuration * 0.7);

		const newStart = Math.max(0, center - newDuration / 2);
		const newEnd = Math.min(duration, newStart + newDuration);

		timeRange.set({
			start: Math.max(0, newEnd - newDuration),
			end: newEnd
		});
	}

	function zoomOut() {
		const duration = $audioBuffer ? $audioBuffer.length / $sampleRate : 10;
		const { start, end } = $timeRange;
		const currentDuration = end - start;
		const center = (start + end) / 2;
		const newDuration = Math.min(duration, currentDuration * 1.4);

		const newStart = Math.max(0, center - newDuration / 2);
		const newEnd = Math.min(duration, newStart + newDuration);

		timeRange.set({
			start: Math.max(0, newEnd - newDuration),
			end: newEnd
		});
	}

	function zoomToSelection() {
		if (!$selection) return;

		const padding = ($selection.end - $selection.start) * 0.1;
		const duration = $audioBuffer ? $audioBuffer.length / $sampleRate : 10;

		timeRange.set({
			start: Math.max(0, $selection.start - padding),
			end: Math.min(duration, $selection.end + padding)
		});
	}

	function zoomToFit() {
		const duration = $audioBuffer ? $audioBuffer.length / $sampleRate : 10;
		timeRange.set({ start: 0, end: duration });
	}
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && pointContextMenu && closePointContextMenu()} />

<div
	class="spectrogram-container"
	class:grabbing={isDraggingPoint}
	class:can-grab={$hoveredPointId !== null && !isDraggingPoint}
	bind:this={container}
	on:mousedown={handleMouseDown}
	on:mousemove={handleMouseMove}
	on:mouseup={handleMouseUp}
	on:mouseleave={handleMouseLeave}
	on:dblclick={handleDoubleClick}
	on:contextmenu={handleContextMenu}
	on:wheel={handleWheel}
	role="application"
	aria-label="Spectrogram - click and drag to select, scroll to zoom, double-click to add data point"
>
	{#if !spectrogramData}
		<div class="computing">Computing spectrogram...</div>
	{/if}
	<canvas bind:this={canvas}></canvas>

	{#if $selection && spectrogramData}
		<button
			class="play-selection-btn"
			style="left: {playButtonX + 4}px;"
			on:mousedown|stopPropagation
			on:click|stopPropagation={handlePlaySelection}
			title="Play selection"
		>
			{#if $isPlaying}
				<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
					<rect x="6" y="4" width="4" height="16"/>
					<rect x="14" y="4" width="4" height="16"/>
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
					<path d="M8 5v14l11-7z"/>
				</svg>
			{/if}
		</button>
	{/if}

	<div class="zoom-controls">
		<button
			class="zoom-btn"
			on:mousedown|stopPropagation
			on:click|stopPropagation={zoomIn}
			title="Zoom in"
		>
			<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
				<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
			</svg>
		</button>
		<button
			class="zoom-btn"
			on:mousedown|stopPropagation
			on:click|stopPropagation={zoomOut}
			title="Zoom out"
		>
			<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
				<path d="M19 13H5v-2h14v2z"/>
			</svg>
		</button>
		{#if $selection}
			<button
				class="zoom-btn"
				on:mousedown|stopPropagation
				on:click|stopPropagation={zoomToSelection}
				title="Zoom to selection"
			>
				<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
					<path d="M3 5v4h2V5h4V3H5c-1.1 0-2 .9-2 2zm2 10H3v4c0 1.1.9 2 2 2h4v-2H5v-4zm14 4h-4v2h4c1.1 0 2-.9 2-2v-4h-2v4zm0-16h-4v2h4v4h2V5c0-1.1-.9-2-2-2z"/>
				</svg>
			</button>
		{/if}
		<button
			class="zoom-btn"
			on:mousedown|stopPropagation
			on:click|stopPropagation={zoomToFit}
			title="Zoom to fit"
		>
			<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
				<path d="M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z"/>
			</svg>
		</button>
	</div>
</div>

<!-- Data point context menu -->
{#if pointContextMenu}
	<div class="context-menu-backdrop" on:click={closePointContextMenu}></div>
	<div
		class="context-menu"
		style="left: {pointContextMenu.x}px; top: {pointContextMenu.y}px;"
	>
		<button class="context-menu-item" on:click={handleRemovePoint}>
			Remove data point
		</button>
	</div>
{/if}

<style>
	.spectrogram-container {
		position: relative;
		width: 100%;
		height: 100%;
		cursor: crosshair;
		background: var(--color-bg);
	}

	.spectrogram-container.can-grab {
		cursor: grab;
	}

	.spectrogram-container.grabbing {
		cursor: grabbing;
	}

	canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}

	.computing {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: var(--color-text-muted);
		z-index: 1;
	}

	.play-selection-btn {
		position: absolute;
		bottom: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 50%;
		background: rgba(74, 158, 255, 0.9);
		color: white;
		cursor: pointer;
		z-index: 10;
		transition: transform 0.1s, background 0.15s;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	.play-selection-btn:hover {
		background: rgba(74, 158, 255, 1);
		transform: scale(1.1);
	}

	.play-selection-btn:active {
		transform: scale(0.95);
	}

	.zoom-controls {
		position: absolute;
		top: 8px;
		right: 54px;
		display: flex;
		gap: 4px;
		z-index: 10;
	}

	.zoom-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		border-radius: 4px;
		background: rgba(60, 60, 60, 0.9);
		color: rgba(255, 255, 255, 0.8);
		cursor: pointer;
		transition: background 0.15s;
	}

	.zoom-btn:hover {
		background: rgba(80, 80, 80, 1);
		color: white;
	}

	.zoom-btn:active {
		transform: scale(0.95);
	}

	.context-menu {
		position: fixed;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 1000;
		min-width: 140px;
		padding: 4px 0;
	}

	.context-menu-item {
		display: block;
		width: 100%;
		padding: 6px 12px;
		border: none;
		background: transparent;
		color: var(--color-text);
		font-size: 12px;
		text-align: left;
		cursor: pointer;
	}

	.context-menu-item:hover {
		background: var(--color-primary);
		color: white;
	}

	.context-menu-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 999;
	}
</style>
