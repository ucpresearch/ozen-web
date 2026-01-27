<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { timeRange } from '$lib/stores/view';

	let container: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let ctx: CanvasRenderingContext2D | null = null;
	let width = 0;
	let height = 24;
	let resizeObserver: ResizeObserver;

	$: if (ctx && width > 0 && $timeRange) {
		draw();
	}

	onMount(() => {
		ctx = canvas.getContext('2d');
		resizeObserver = new ResizeObserver(entries => {
			const rect = entries[0].contentRect;
			width = rect.width;
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
		if (!ctx || width === 0) return;

		const { start, end } = $timeRange;
		const duration = end - start;

		// Clear
		ctx.fillStyle = '#2d2d2d';
		ctx.fillRect(0, 0, width, height);

		// Calculate tick interval based on zoom level
		const targetTickCount = Math.floor(width / 80);
		const rawInterval = duration / targetTickCount;

		// Round to nice intervals
		const niceIntervals = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60];
		let tickInterval = niceIntervals.find(i => i >= rawInterval) || 60;

		// Draw ticks and labels
		ctx.strokeStyle = '#606060';
		ctx.fillStyle = '#a0a0a0';
		ctx.font = '10px sans-serif';
		ctx.textAlign = 'center';

		const firstTick = Math.ceil(start / tickInterval) * tickInterval;

		for (let t = firstTick; t <= end; t += tickInterval) {
			const x = ((t - start) / duration) * width;

			// Major tick line
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, 6);
			ctx.stroke();

			// Time label
			const label = formatTime(t, tickInterval);
			ctx.fillText(label, x, 18);
		}

		// Minor ticks
		const minorInterval = tickInterval / 5;
		if (minorInterval >= 0.001) {
			ctx.strokeStyle = '#404040';
			const firstMinor = Math.ceil(start / minorInterval) * minorInterval;
			for (let t = firstMinor; t <= end; t += minorInterval) {
				const x = ((t - start) / duration) * width;
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x, 3);
				ctx.stroke();
			}
		}
	}

	function formatTime(seconds: number, interval: number): string {
		if (interval >= 60) {
			const mins = Math.floor(seconds / 60);
			const secs = Math.floor(seconds % 60);
			return `${mins}:${secs.toString().padStart(2, '0')}`;
		} else if (interval >= 1) {
			return seconds.toFixed(0) + 's';
		} else if (interval >= 0.1) {
			return seconds.toFixed(1);
		} else if (interval >= 0.01) {
			return seconds.toFixed(2);
		} else {
			return seconds.toFixed(3);
		}
	}
</script>

<div class="time-axis" bind:this={container}>
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.time-axis {
		width: 100%;
		height: 24px;
		background: var(--color-surface);
	}

	canvas {
		width: 100%;
		height: 100%;
	}
</style>
