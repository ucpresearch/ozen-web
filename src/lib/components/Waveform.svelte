<!--
	Waveform Component

	Displays the audio waveform as amplitude over time, synchronized with the spectrogram.
	Uses efficient downsampling to render even long audio files without performance issues.

	Features:
	- Min/max downsampling: samples are rendered as vertical lines showing amplitude range
	- Selection visualization: highlighted regions for playback
	- Cursor line: red vertical line showing current time position
	- Hover position: follows mouse for precise positioning
	- Click-drag selection: same interaction model as spectrogram

	Rendering strategy:
	- Each pixel column represents a time bin
	- For each bin, finds min/max sample values
	- Draws a vertical line from min to max
	- This efficiently renders millions of samples at any zoom level

	The waveform always displays, regardless of audio length, unlike the spectrogram
	which may defer rendering for long files until zoomed.
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { audioBuffer, sampleRate } from '$lib/stores/audio';
	import { timeRange, cursorPosition, selection, hoverPosition } from '$lib/stores/view';
	import { config } from '$lib/stores/config';

	let container: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let width = 0;
	let height = 0;
	let resizeObserver: ResizeObserver;

	// Interaction state
	let isSelecting = false;
	let selectionStart = 0;

	// Axis margins (same as Spectrogram)
	const leftMargin = 45;
	const rightMargin = 45;

	$: plotWidth = Math.max(0, width - leftMargin - rightMargin);
	$: plotRight = width - rightMargin;

	$: if (ctx && $audioBuffer && width > 0 && $timeRange && $selection !== undefined && $cursorPosition !== undefined && $hoverPosition !== undefined) {
		draw();
	}

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
	});

	function draw() {
		if (!ctx || !$audioBuffer || width === 0) return;

		const samples = $audioBuffer;
		const sr = $sampleRate;
		const { start, end } = $timeRange;
		const cfg = $config.colors;

		// Clear canvas
		ctx.fillStyle = getComputedStyle(container).getPropertyValue('--color-bg').trim() || '#1a1a1a';
		ctx.fillRect(0, 0, width, height);

		// Draw margin areas
		ctx.fillStyle = getComputedStyle(container).getPropertyValue('--color-surface').trim() || '#2a2a2a';
		ctx.fillRect(0, 0, leftMargin, height);
		ctx.fillRect(width - rightMargin, 0, rightMargin, height);

		// Draw plot background
		ctx.fillStyle = cfg.waveform.background;
		ctx.fillRect(leftMargin, 0, plotWidth, height);

		// Draw selection if present (in plot area only)
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

		// Calculate sample range
		const startSample = Math.floor(start * sr);
		const endSample = Math.ceil(end * sr);
		const samplesPerPixel = (endSample - startSample) / plotWidth;

		// Find peak amplitude in visible range for normalization (sample for performance)
		let peakAmp = 0;
		const sampleCount = endSample - startSample;
		const step = Math.max(1, Math.floor(sampleCount / 1000)); // Check at most 1000 samples
		for (let i = Math.max(0, startSample); i < Math.min(endSample, samples.length); i += step) {
			const absVal = Math.abs(samples[i]);
			if (absVal > peakAmp) peakAmp = absVal;
		}
		// Normalize to fill vertical space, cap gain at 10x
		const normalizer = peakAmp > 0.01 ? Math.min(0.95 / peakAmp, 10) : 1;

		// Draw waveform using min/max downsampling (black line, Praat style)
		ctx.strokeStyle = cfg.waveform.line;
		ctx.lineWidth = cfg.waveform.lineWidth;

		const centerY = height / 2;
		const amplitude = (height / 2 - 4) * normalizer;

		// Clip to plot area
		ctx.save();
		ctx.beginPath();
		ctx.rect(leftMargin, 0, plotWidth, height);
		ctx.clip();

		if (samplesPerPixel <= 1) {
			// Zoom is very close - draw actual samples
			ctx.beginPath();
			for (let px = 0; px < plotWidth; px++) {
				const sampleIdx = Math.floor(startSample + px * samplesPerPixel);
				if (sampleIdx >= 0 && sampleIdx < samples.length) {
					const x = leftMargin + px;
					const y = centerY - samples[sampleIdx] * amplitude;
					if (px === 0) ctx.moveTo(x, y);
					else ctx.lineTo(x, y);
				}
			}
			ctx.stroke();
		} else {
			// Draw min/max envelope
			const mins: number[] = [];
			const maxs: number[] = [];

			for (let px = 0; px < plotWidth; px++) {
				const s0 = Math.floor(startSample + px * samplesPerPixel);
				const s1 = Math.floor(startSample + (px + 1) * samplesPerPixel);
				let min = Infinity;
				let max = -Infinity;

				for (let i = s0; i < s1 && i < samples.length; i++) {
					if (i >= 0) {
						const v = samples[i];
						if (v < min) min = v;
						if (v > max) max = v;
					}
				}

				if (min !== Infinity) {
					mins.push(min);
					maxs.push(max);
				} else {
					mins.push(0);
					maxs.push(0);
				}
			}

			// Draw filled area between min and max
			ctx.fillStyle = cfg.waveform.line;
			ctx.beginPath();
			for (let px = 0; px < mins.length; px++) {
				const x = leftMargin + px;
				const yMax = centerY - maxs[px] * amplitude;
				if (px === 0) ctx.moveTo(x, yMax);
				else ctx.lineTo(x, yMax);
			}
			for (let px = mins.length - 1; px >= 0; px--) {
				const x = leftMargin + px;
				const yMin = centerY - mins[px] * amplitude;
				ctx.lineTo(x, yMin);
			}
			ctx.closePath();
			ctx.fill();
		}

		// Draw center line
		ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(leftMargin, centerY);
		ctx.lineTo(plotRight, centerY);
		ctx.stroke();

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

		ctx.restore();
	}

	function timeToXPlot(time: number, start: number, end: number): number {
		return leftMargin + ((time - start) / (end - start)) * plotWidth;
	}

	function xPlotToTime(x: number, start: number, end: number): number {
		if (plotWidth <= 0) return start;
		return start + ((x - leftMargin) / plotWidth) * (end - start);
	}

	function handleMouseDown(e: MouseEvent) {
		// Blur any active input (closes annotation text editors)
		if (document.activeElement instanceof HTMLInputElement) {
			document.activeElement.blur();
		}

		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;

		// Only start selection if clicking in the plot area
		if (x < leftMargin || x > width - rightMargin) return;

		const time = xPlotToTime(x, $timeRange.start, $timeRange.end);

		if (e.shiftKey) {
			// Pan mode - handled by parent
			return;
		}

		isSelecting = true;
		selectionStart = time;
		cursorPosition.set(time);
		selection.set(null);
	}

	function handleMouseMove(e: MouseEvent) {
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;

		// Only track hover in plot area
		if (x < leftMargin || x > width - rightMargin) {
			hoverPosition.set(null);
			return;
		}

		const time = xPlotToTime(x, $timeRange.start, $timeRange.end);

		// Update hover position for coordinated cursor
		hoverPosition.set(time);

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
		isSelecting = false;
	}

	function handleMouseLeave() {
		isSelecting = false;
		hoverPosition.set(null);
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

		// Keep the mouse position anchored
		const ratio = (time - start) / currentDuration;
		const newStart = Math.max(0, time - ratio * newDuration);
		const newEnd = Math.min(duration, newStart + newDuration);

		timeRange.set({
			start: Math.max(0, newEnd - newDuration),
			end: newEnd
		});
	}
</script>

<div
	class="waveform-container"
	bind:this={container}
	on:mousedown={handleMouseDown}
	on:mousemove={handleMouseMove}
	on:mouseup={handleMouseUp}
	on:mouseleave={handleMouseLeave}
	on:wheel={handleWheel}
	role="application"
	aria-label="Audio waveform - click and drag to select, scroll to zoom"
>
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.waveform-container {
		position: relative;
		width: 100%;
		height: 100%;
		cursor: crosshair;
		background: var(--color-bg);
	}

	canvas {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
	}
</style>
