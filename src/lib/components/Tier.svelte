<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import { timeRange, cursorPosition, selection, hoverPosition } from '$lib/stores/view';
	import {
		selectedTierIndex,
		selectedIntervalIndex,
		addBoundary,
		removeBoundary,
		updateIntervalText
	} from '$lib/stores/annotations';
	import type { Tier as TierType } from '$lib/types';

	export let tier: TierType;
	export let index: number;
	export let isSelected: boolean = false;

	const dispatch = createEventDispatcher();

	let container: HTMLDivElement;
	let width = 0;
	let height = 0;
	let resizeObserver: ResizeObserver;

	let editingIndex: number | null = null;
	let editText = '';

	// Context menu state
	let contextMenu: { x: number; y: number; intervalIndex: number } | null = null;

	function handleBoundaryContextMenu(e: MouseEvent, intervalIndex: number) {
		e.preventDefault();
		e.stopPropagation();
		contextMenu = {
			x: e.clientX,
			y: e.clientY,
			intervalIndex
		};
	}

	function closeContextMenu() {
		contextMenu = null;
	}

	function handleRemoveBoundary() {
		if (contextMenu) {
			selectedTierIndex.set(index);
			removeBoundary(contextMenu.intervalIndex);
			contextMenu = null;
		}
	}

	// Axis margins (same as Spectrogram)
	const leftMargin = 45;
	const rightMargin = 45;

	$: plotWidth = Math.max(0, width - leftMargin - rightMargin);
	$: plotRight = width - rightMargin;

	onMount(() => {
		resizeObserver = new ResizeObserver(entries => {
			const rect = entries[0].contentRect;
			width = rect.width;
			height = rect.height;
		});
		resizeObserver.observe(container);
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
	});

	function timeToX(time: number): number {
		const { start, end } = $timeRange;
		return leftMargin + ((time - start) / (end - start)) * plotWidth;
	}

	function xToTime(x: number): number {
		const { start, end } = $timeRange;
		return start + ((x - leftMargin) / plotWidth) * (end - start);
	}

	function handleTierClick() {
		selectedTierIndex.set(index);
	}

	function handleMouseMove(e: MouseEvent) {
		const rect = container.getBoundingClientRect();
		const x = e.clientX - rect.left;

		// Only track hover in plot area
		if (x < leftMargin || x > width - rightMargin) {
			hoverPosition.set(null);
			return;
		}

		const time = xToTime(x);
		hoverPosition.set(time);
	}

	function handleMouseLeave() {
		hoverPosition.set(null);
	}

	function handleIntervalClick(e: MouseEvent, intervalIndex: number) {
		e.stopPropagation();
		selectedTierIndex.set(index);
		selectedIntervalIndex.set(intervalIndex);

		// Set selection to the interval's time range
		const interval = tier.intervals[intervalIndex];
		if (interval) {
			selection.set({
				start: interval.start,
				end: interval.end
			});
			cursorPosition.set(interval.start);
		}
	}

	function handleIntervalDoubleClick(e: MouseEvent, intervalIndex: number) {
		e.stopPropagation();
		// Add boundary at click position (not edit - use click on text for that)
		const rect = container.getBoundingClientRect();
		const x = e.clientX - rect.left;

		// Only allow in plot area
		if (x < leftMargin || x > width - rightMargin) return;

		const time = xToTime(x);
		selectedTierIndex.set(index);
		addBoundary(time);
	}

	function handleBackgroundDoubleClick(e: MouseEvent) {
		// Add boundary at click position
		const rect = container.getBoundingClientRect();
		const x = e.clientX - rect.left;

		// Only allow in plot area
		if (x < leftMargin || x > width - rightMargin) return;

		const time = xToTime(x);
		selectedTierIndex.set(index);
		addBoundary(time);
	}

	function startEditing(intervalIndex: number) {
		editingIndex = intervalIndex;
		editText = tier.intervals[intervalIndex].text;
	}

	function finishEditing() {
		if (editingIndex !== null) {
			// updateIntervalText handles saveUndo internally
			updateIntervalText(index, editingIndex, editText);
			editingIndex = null;
			editText = '';
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			finishEditing();
		} else if (e.key === 'Escape') {
			editingIndex = null;
			editText = '';
		}
	}

	function getVisibleIntervals() {
		const { start, end } = $timeRange;
		return tier.intervals
			.map((int, i) => ({ ...int, index: i }))
			.filter(int => int.end > start && int.start < end);
	}
</script>

<div
	class="tier-container"
	class:selected={isSelected}
	bind:this={container}
	on:click={handleTierClick}
	on:dblclick={handleBackgroundDoubleClick}
	on:mousemove={handleMouseMove}
	on:mouseleave={handleMouseLeave}
	role="button"
	tabindex="0"
	on:keydown={(e) => e.key === 'Enter' && handleTierClick()}
>
	<!-- Left margin area -->
	<div class="margin-area left" style="width: {leftMargin}px;"></div>

	<!-- Right margin area -->
	<div class="margin-area right" style="width: {rightMargin}px;"></div>

	<div class="tier-label">{tier.name}</div>

	<div class="intervals" style="left: {leftMargin}px; right: {rightMargin}px;">
		{#each getVisibleIntervals() as interval (interval.index)}
			{@const x1 = Math.max(leftMargin, timeToX(interval.start))}
			{@const x2 = Math.min(plotRight, timeToX(interval.end))}
			{@const intervalWidth = x2 - x1}
			{@const relativeX1 = x1 - leftMargin}

			{#if intervalWidth > 2}
				{@const duration = interval.end - interval.start}
				{@const durationStr = duration >= 1 ? duration.toFixed(2) + 's' : (duration * 1000).toFixed(0) + 'ms'}
				<div
					class="interval"
					class:selected={isSelected && $selectedIntervalIndex === interval.index}
					style="left: {relativeX1}px; width: {intervalWidth}px;"
					on:click={(e) => handleIntervalClick(e, interval.index)}
					on:dblclick={(e) => handleIntervalDoubleClick(e, interval.index)}
					role="button"
					tabindex="0"
					on:keydown={(e) => { if (e.key === 'Enter') { selectedTierIndex.set(index); selectedIntervalIndex.set(interval.index); } }}
				>
					{#if editingIndex === interval.index}
						<input
							type="text"
							class="interval-input"
							bind:value={editText}
							on:blur={finishEditing}
							on:keydown={handleKeydown}
							autofocus
						/>
					{:else}
						<span
								class="interval-text"
								on:click|stopPropagation={() => {
									// Select the interval
									selection.set({
										start: interval.start,
										end: interval.end
									});
									cursorPosition.set(interval.start);
									startEditing(interval.index);
								}}
								role="button"
								tabindex="0"
								on:keydown={(e) => e.key === 'Enter' && startEditing(interval.index)}
							>{interval.text || '\u00A0'}</span>
						{#if intervalWidth > 30}
							<span class="interval-duration">{durationStr}</span>
						{/if}
					{/if}
				</div>

				<!-- Boundary handle (except for first interval) -->
				{#if interval.index > 0}
					<div
						class="boundary"
						style="left: {relativeX1}px;"
						title="Click to edit, right-click to remove"
						on:click|stopPropagation={() => {
							selectedTierIndex.set(index);
							selectedIntervalIndex.set(interval.index);
							// Select the interval
							selection.set({
								start: interval.start,
								end: interval.end
							});
							cursorPosition.set(interval.start);
							startEditing(interval.index);
						}}
						on:contextmenu={(e) => handleBoundaryContextMenu(e, interval.index)}
						role="button"
						tabindex="0"
						on:keydown={(e) => e.key === 'Enter' && startEditing(interval.index)}
					></div>
				{/if}
			{/if}
		{/each}
	</div>

	<!-- Hover cursor -->
	{#if $hoverPosition !== null && timeToX($hoverPosition) >= leftMargin && timeToX($hoverPosition) <= plotRight}
		<div class="hover-cursor" style="left: {timeToX($hoverPosition)}px;"></div>
	{/if}

	<!-- Cursor -->
	{#if timeToX($cursorPosition) >= leftMargin && timeToX($cursorPosition) <= plotRight}
		<div class="cursor" style="left: {timeToX($cursorPosition)}px;"></div>
	{/if}
</div>

<svelte:window on:keydown={(e) => e.key === 'Escape' && contextMenu && closeContextMenu()} />

<!-- Context menu -->
{#if contextMenu}
	<div class="context-menu-backdrop" on:click={closeContextMenu}></div>
	<div
		class="context-menu"
		style="left: {contextMenu.x}px; top: {contextMenu.y}px;"
	>
		<button class="context-menu-item" on:click={handleRemoveBoundary}>
			Remove boundary
		</button>
	</div>
{/if}

<style>
	.tier-container {
		position: relative;
		height: 100%;
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
		cursor: text;
		overflow: hidden;
	}

	.tier-container.selected {
		background: rgba(74, 158, 255, 0.05);
	}

	.margin-area {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--color-surface);
		z-index: 1;
	}

	.margin-area.left {
		left: 0;
	}

	.margin-area.right {
		right: 0;
	}

	.tier-label {
		position: absolute;
		top: 2px;
		left: 4px;
		font-size: 10px;
		color: var(--color-text-muted);
		z-index: 4;
		pointer-events: none;
	}

	.intervals {
		position: absolute;
		top: 0;
		bottom: 0;
	}

	.interval {
		position: absolute;
		top: 0;
		bottom: 0;
		border-right: 1px solid var(--color-border);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: text;
		transition: background 0.1s;
	}

	.interval:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.interval.selected {
		background: rgba(74, 158, 255, 0.15);
	}

	.interval-text {
		font-size: 12px;
		color: var(--color-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 2px 8px;
		max-width: 100%;
		min-width: 20px;
		min-height: 18px;
		cursor: text;
		border-radius: 3px;
		border: 1px dashed transparent;
		background: rgba(255, 255, 255, 0.05);
		transition: all 0.15s;
	}

	.interval-text:hover {
		background: rgba(74, 158, 255, 0.25);
		border-color: rgba(74, 158, 255, 0.5);
	}

	.interval-duration {
		position: absolute;
		bottom: 2px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 9px;
		color: var(--color-text-muted);
		opacity: 0.7;
		pointer-events: none;
	}

	.interval-input {
		width: calc(100% - 8px);
		max-width: 200px;
		background: var(--color-surface);
		border: 1px solid var(--color-primary);
		border-radius: 2px;
		color: var(--color-text);
		font-size: 12px;
		padding: 2px 4px;
		text-align: center;
	}

	.boundary {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 11px;
		margin-left: -5px;
		background: transparent;
		cursor: ew-resize;
		z-index: 5;
	}

	.boundary::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 4px;
		width: 3px;
		background: var(--color-primary);
		opacity: 0.7;
		transition: opacity 0.1s, width 0.1s, left 0.1s;
	}

	.boundary:hover::before {
		opacity: 1;
		width: 5px;
		left: 3px;
	}

	.hover-cursor {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--color-cursor);
		opacity: 0.5;
		pointer-events: none;
		z-index: 2;
		border-left: 1px dashed var(--color-cursor);
	}

	.cursor {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--color-cursor);
		pointer-events: none;
		z-index: 3;
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
