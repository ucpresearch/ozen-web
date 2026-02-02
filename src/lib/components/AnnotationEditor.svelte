<!--
	Annotation Editor Component

	Multi-tier annotation interface for transcription and labeling.
	Provides TextGrid-compatible annotation editing with Praat interoperability.

	Features:
	- Multi-tier support: unlimited annotation tiers with custom names
	- Tier management: add, rename, remove tiers via modal dialogs
	- TextGrid import: supports both short and long TextGrid formats
	- TextGrid export: saves annotations in Praat-compatible format
	- Keyboard tier selection: press 1-5 to quickly switch between tiers
	- Undo/redo: unified undo system for annotation operations

	Each tier is rendered as a Tier component below the spectrogram, showing:
	- Intervals with text labels
	- Boundaries (vertical lines between intervals)
	- Interactive editing: double-click to add/edit, drag to move boundaries

	The editor only appears when audio is loaded (controlled by parent component).
	On mount, initializes with a default tier if none exist.

	TextGrid compatibility:
	- Import: parses both short ("text") and long ("ooTextFile") formats
	- Export: uses short format with UTF-8 encoding
	- Interval tiers only (point tiers not yet supported)
-->
<script lang="ts">
	import Tier from './Tier.svelte';
	import Modal from './Modal.svelte';
	import {
		tiers,
		selectedTierIndex,
		addTier,
		removeTier,
		renameTier,
		loadTextGrid,
		exportTiers,
		initializeDefaultTier
	} from '$lib/stores/annotations';
	import { undo, redo } from '$lib/stores/undoManager';
	import { fileName } from '$lib/stores/audio';
	import { onMount } from 'svelte';

	let fileInput: HTMLInputElement;

	// Modal state
	type ModalType = 'addTier' | 'renameTier' | 'removeTier' | 'exportTextGrid' | 'alert' | null;
	let activeModal: ModalType = null;
	let alertMessage = '';
	let exportDefaultName = 'annotations.TextGrid';

	onMount(() => {
		// Initialize with a default tier if none exist
		if ($tiers.length === 0) {
			initializeDefaultTier();
		}
	});

	function showAlert(message: string) {
		alertMessage = message;
		activeModal = 'alert';
	}

	function handleImport() {
		fileInput.click();
	}

	async function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		try {
			const content = await file.text();
			loadTextGrid(content);
		} catch (err) {
			console.error('Failed to load TextGrid:', err);
			showAlert('Failed to parse TextGrid file: ' + (err instanceof Error ? err.message : String(err)));
		}

		// Reset input so same file can be re-selected
		input.value = '';
	}

	async function handleExport() {
		// Generate default filename from audio file name
		if ($fileName) {
			const baseName = $fileName.replace(/\.[^/.]+$/, '');
			exportDefaultName = baseName + '.TextGrid';
		} else {
			exportDefaultName = 'annotations.TextGrid';
		}

		// Try File System Access API (shows native Save As dialog)
		if ('showSaveFilePicker' in window) {
			try {
				const content = exportTiers();
				const handle = await (window as any).showSaveFilePicker({
					suggestedName: exportDefaultName,
					types: [{
						description: 'Praat TextGrid',
						accept: { 'text/plain': ['.TextGrid'] }
					}]
				});
				const writable = await handle.createWritable();
				await writable.write(content);
				await writable.close();
				return;
			} catch (err: any) {
				// User cancelled - do nothing
				if (err.name === 'AbortError') return;
				// Other error - fall through to modal
			}
		}

		// Fallback: show modal to choose filename (download goes to default folder)
		activeModal = 'exportTextGrid';
	}

	function doExport(filename: string) {
		const content = exportTiers();
		const blob = new Blob([content], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		// Ensure .TextGrid extension
		a.download = filename.endsWith('.TextGrid') ? filename : filename + '.TextGrid';
		a.click();
		URL.revokeObjectURL(url);
	}

	function handleAddTier() {
		activeModal = 'addTier';
	}

	function handleRemoveTier() {
		if ($tiers.length <= 1) {
			showAlert('Cannot remove the last tier');
			return;
		}
		activeModal = 'removeTier';
	}

	function handleRenameTier() {
		activeModal = 'renameTier';
	}

	function handleModalConfirm(e: CustomEvent<string | void>) {
		const modal = activeModal;
		activeModal = null;

		if (modal === 'addTier' && typeof e.detail === 'string' && e.detail) {
			addTier(e.detail);
		} else if (modal === 'renameTier' && typeof e.detail === 'string' && e.detail) {
			const currentName = $tiers[$selectedTierIndex]?.name || '';
			if (e.detail !== currentName) {
				renameTier($selectedTierIndex, e.detail);
			}
		} else if (modal === 'removeTier') {
			removeTier($selectedTierIndex);
		} else if (modal === 'exportTextGrid' && typeof e.detail === 'string' && e.detail) {
			doExport(e.detail);
		}
	}

	function handleModalCancel() {
		activeModal = null;
	}
</script>

<div class="annotation-editor">
	<div class="annotation-toolbar">
		<button on:click={handleImport} title="Import TextGrid">Import</button>
		<button on:click={handleExport} title="Export TextGrid">Export</button>
		<span class="separator"></span>
		<button on:click={handleAddTier} title="Add new tier">+ Tier</button>
		<button on:click={handleRenameTier} title="Rename selected tier">Rename</button>
		<button on:click={handleRemoveTier} title="Remove selected tier">- Tier</button>
		<span class="separator"></span>
		<button on:click={undo} title="Undo (Ctrl+Z)">Undo</button>
		<button on:click={redo} title="Redo (Ctrl+Y)">Redo</button>
		<span class="tier-count">{$tiers.length} tier{$tiers.length !== 1 ? 's' : ''}</span>
	</div>

	<div class="tiers-container">
		{#each $tiers as tier, i (i)}
			<div class="tier-row">
				<Tier {tier} index={i} isSelected={i === $selectedTierIndex} />
			</div>
		{/each}

		{#if $tiers.length === 0}
			<div class="empty-message">
				No annotation tiers. Click "+ Tier" to add one, or import a TextGrid.
			</div>
		{/if}
	</div>

	<input
		bind:this={fileInput}
		type="file"
		accept=".TextGrid,.textgrid,.txt,text/plain"
		on:change={handleFileSelect}
		style="display: none;"
	/>
</div>

{#if activeModal === 'addTier'}
	<Modal
		title="Add Tier"
		type="prompt"
		message="Enter a name for the new tier:"
		placeholder="Tier name"
		initialValue={`Tier ${$tiers.length + 1}`}
		confirmText="Add"
		on:confirm={handleModalConfirm}
		on:cancel={handleModalCancel}
	/>
{/if}

{#if activeModal === 'renameTier'}
	<Modal
		title="Rename Tier"
		type="prompt"
		message="Enter a new name for the tier:"
		placeholder="Tier name"
		initialValue={$tiers[$selectedTierIndex]?.name || ''}
		confirmText="Rename"
		on:confirm={handleModalConfirm}
		on:cancel={handleModalCancel}
	/>
{/if}

{#if activeModal === 'removeTier'}
	<Modal
		title="Remove Tier"
		type="confirm"
		message={`Are you sure you want to remove tier "${$tiers[$selectedTierIndex]?.name}"?`}
		confirmText="Remove"
		on:confirm={handleModalConfirm}
		on:cancel={handleModalCancel}
	/>
{/if}

{#if activeModal === 'alert'}
	<Modal
		title="Notice"
		type="alert"
		message={alertMessage}
		on:confirm={handleModalCancel}
	/>
{/if}

{#if activeModal === 'exportTextGrid'}
	<Modal
		title="Export TextGrid"
		type="prompt"
		message="Enter a filename for the TextGrid:"
		placeholder="filename.TextGrid"
		initialValue={exportDefaultName}
		confirmText="Export"
		on:confirm={handleModalConfirm}
		on:cancel={handleModalCancel}
	/>
{/if}

<style>
	.annotation-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--color-bg);
	}

	.annotation-toolbar {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.25rem 0.5rem;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.annotation-toolbar button {
		padding: 0.2rem 0.5rem;
		font-size: 0.75rem;
		background: var(--color-border);
		border: none;
		border-radius: 3px;
		color: var(--color-text);
		cursor: pointer;
		transition: background 0.15s;
	}

	.annotation-toolbar button:hover {
		background: var(--color-primary);
	}

	.separator {
		width: 1px;
		height: 16px;
		background: var(--color-border);
		margin: 0 0.25rem;
	}

	.tier-count {
		margin-left: auto;
		font-size: 0.7rem;
		color: var(--color-text-muted);
	}

	.tiers-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
	}

	.tier-row {
		flex: 1;
		min-height: 28px;
	}

	/* On larger screens, give tiers more space */
	@media (min-height: 600px) {
		.tier-row {
			min-height: 35px;
		}
	}

	.empty-message {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}
</style>
