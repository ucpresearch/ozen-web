<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';

	export let title: string = '';
	export let type: 'alert' | 'confirm' | 'prompt' = 'alert';
	export let message: string = '';
	export let placeholder: string = '';
	export let initialValue: string = '';
	export let confirmText: string = 'OK';
	export let cancelText: string = 'Cancel';

	const dispatch = createEventDispatcher();

	let inputValue = initialValue;
	let inputElement: HTMLInputElement;

	onMount(() => {
		if (type === 'prompt' && inputElement) {
			inputElement.focus();
			inputElement.select();
		}
	});

	function handleConfirm() {
		if (type === 'prompt') {
			dispatch('confirm', inputValue);
		} else {
			dispatch('confirm');
		}
	}

	function handleCancel() {
		dispatch('cancel');
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleCancel();
		} else if (e.key === 'Enter' && type !== 'prompt') {
			handleConfirm();
		}
	}

	function handleInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			handleConfirm();
		} else if (e.key === 'Escape') {
			handleCancel();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleCancel();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="modal-backdrop" on:click={handleBackdropClick} role="dialog" aria-modal="true">
	<div class="modal">
		{#if title}
			<div class="modal-header">{title}</div>
		{/if}

		<div class="modal-body">
			{#if message}
				<p class="modal-message">{message}</p>
			{/if}

			{#if type === 'prompt'}
				<input
					type="text"
					class="modal-input"
					bind:this={inputElement}
					bind:value={inputValue}
					{placeholder}
					on:keydown={handleInputKeydown}
				/>
			{/if}
		</div>

		<div class="modal-footer">
			{#if type !== 'alert'}
				<button class="modal-btn cancel" on:click={handleCancel}>
					{cancelText}
				</button>
			{/if}
			<button class="modal-btn confirm" on:click={handleConfirm}>
				{confirmText}
			</button>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		min-width: 300px;
		max-width: 450px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
	}

	.modal-header {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--color-border);
		font-weight: 600;
		font-size: 14px;
	}

	.modal-body {
		padding: 1rem;
	}

	.modal-message {
		margin: 0 0 0.75rem 0;
		font-size: 13px;
		color: var(--color-text);
	}

	.modal-input {
		width: 100%;
		padding: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		background: var(--color-bg);
		color: var(--color-text);
		font-size: 13px;
	}

	.modal-input:focus {
		outline: none;
		border-color: var(--color-primary);
	}

	.modal-footer {
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--color-border);
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.modal-btn {
		padding: 0.4rem 0.9rem;
		border: none;
		border-radius: 4px;
		font-size: 13px;
		cursor: pointer;
		transition: background 0.15s;
	}

	.modal-btn.cancel {
		background: var(--color-border);
		color: var(--color-text);
	}

	.modal-btn.cancel:hover {
		background: var(--color-text-muted);
	}

	.modal-btn.confirm {
		background: var(--color-primary);
		color: white;
	}

	.modal-btn.confirm:hover {
		filter: brightness(1.1);
	}
</style>
