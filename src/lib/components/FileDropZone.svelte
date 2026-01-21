<script lang="ts">
	export let onFile: (file: File) => void;

	let isDragOver = false;
	let fileInput: HTMLInputElement;

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragOver = false;
		const file = e.dataTransfer?.files[0];
		if (file) onFile(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave() {
		isDragOver = false;
	}

	function handleClick() {
		fileInput.click();
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) onFile(file);
	}
</script>

<div
	class="drop-zone"
	class:drag-over={isDragOver}
	role="button"
	tabindex="0"
	on:drop={handleDrop}
	on:dragover={handleDragOver}
	on:dragleave={handleDragLeave}
	on:click={handleClick}
	on:keydown={(e) => e.key === 'Enter' && handleClick()}
>
	<div class="icon">
		<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
			<path d="M12 15V3m0 0l-4 4m4-4l4 4" />
			<path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" />
		</svg>
	</div>
	<p class="primary">Drop an audio file here</p>
	<p class="secondary">or click to select</p>
	<p class="formats">Supports WAV, FLAC, MP3, OGG</p>
	<input
		bind:this={fileInput}
		type="file"
		accept="audio/*"
		on:change={handleFileSelect}
	/>
</div>

<style>
	.drop-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		border: 3px dashed var(--color-border);
		border-radius: 12px;
		margin: 2rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.drop-zone:hover,
	.drop-zone.drag-over {
		border-color: var(--color-primary);
		background: rgba(74, 158, 255, 0.05);
	}

	.icon {
		color: var(--color-text-muted);
		margin-bottom: 1rem;
	}

	.drop-zone:hover .icon,
	.drop-zone.drag-over .icon {
		color: var(--color-primary);
	}

	.primary {
		font-size: 1.25rem;
		margin: 0 0 0.5rem;
	}

	.secondary {
		color: var(--color-text-muted);
		margin: 0 0 1rem;
	}

	.formats {
		font-size: 0.75rem;
		color: var(--color-text-muted);
		margin: 0;
	}

	input {
		display: none;
	}
</style>
