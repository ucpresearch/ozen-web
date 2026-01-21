<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { initConfig } from '$lib/stores/config';

	// Suppress SvelteKit params warning
	export let data: Record<string, unknown> = {};

	onMount(() => {
		initConfig();
	});
</script>

<slot />
