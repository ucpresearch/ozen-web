<script lang="ts">
	import { onDestroy } from 'svelte';

	export let onFile: (file: File) => void;
	export let onRecordedBlob: ((blob: Blob) => void) | undefined = undefined;

	let isDragOver = false;
	let fileInput: HTMLInputElement;

	// Recording state
	let isRecording = false;
	let mediaRecorder: MediaRecorder | null = null;
	let mediaStream: MediaStream | null = null;
	let recordedChunks: Blob[] = [];
	let recordingTime = 0;
	let recordingTimer: ReturnType<typeof setInterval> | null = null;

	onDestroy(() => {
		// Clean up recording resources
		if (recordingTimer) {
			clearInterval(recordingTimer);
		}
		if (mediaRecorder && isRecording) {
			mediaRecorder.stop();
		}
		// Ensure microphone stream is released
		if (mediaStream) {
			mediaStream.getTracks().forEach(track => track.stop());
			mediaStream = null;
		}
	});

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

	/**
	 * Start recording audio from the device microphone.
	 */
	async function startRecording() {
		if (!onRecordedBlob) return;

		try {
			// Request microphone access with processing disabled for clean capture
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false
				}
			});
			mediaStream = stream;

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
				mediaStream = null;

				// Convert recorded chunks to blob and pass to parent
				const blob = new Blob(recordedChunks, { type: 'audio/webm' });
				onRecordedBlob?.(blob);
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
</script>

{#if isRecording}
	<!-- Recording state UI -->
	<div class="drop-zone recording">
		<div class="recording-indicator">
			<div class="recording-pulse"></div>
			<span class="recording-time">{recordingTime.toFixed(1)}s</span>
		</div>
		<button class="stop-record-btn" on:click={stopRecording}>
			<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
				<rect x="6" y="6" width="12" height="12" rx="2"/>
			</svg>
			<span>Stop Recording</span>
		</button>
	</div>
{:else}
	<!-- Normal drop zone UI -->
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

		{#if onRecordedBlob}
			<div class="record-section">
				<span class="divider-text">or</span>
				<button class="record-btn" on:click|stopPropagation={startRecording}>
					<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
						<circle cx="12" cy="12" r="8"/>
					</svg>
					<span>Record from Microphone</span>
				</button>
			</div>
		{/if}

		<p class="formats">Supports WAV, FLAC, MP3, OGG</p>
		<input
			bind:this={fileInput}
			type="file"
			accept="audio/*"
			on:change={handleFileSelect}
		/>
	</div>
{/if}

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

	.drop-zone.recording {
		cursor: default;
		border-color: #ef4444;
		background: rgba(239, 68, 68, 0.05);
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
		margin: 1rem 0 0;
	}

	input {
		display: none;
	}

	/* Record section */
	.record-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		margin: 0.5rem 0;
	}

	.divider-text {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	.record-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 1.2rem;
		border: 2px solid #ef4444;
		border-radius: 8px;
		background: transparent;
		color: #ef4444;
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.record-btn:hover {
		background: rgba(239, 68, 68, 0.1);
	}

	.record-btn:active {
		transform: scale(0.98);
	}

	.record-btn svg {
		color: #ef4444;
	}

	/* Recording indicator */
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
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 8px;
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
		transform: scale(0.98);
	}
</style>
