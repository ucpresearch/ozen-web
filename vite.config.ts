import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		exclude: ['praatfan-core-wasm']
	},
	server: {
		fs: {
			allow: ['..']
		}
	},
	assetsInclude: ['**/*.wasm']
});
