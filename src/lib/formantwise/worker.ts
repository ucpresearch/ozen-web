/**
 * Web Worker for formantwise-core WASM pipeline.
 *
 * Loads the WASM module from a URL passed via 'init' message,
 * then runs speaker config estimation or the full pipeline on demand.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wasm: any = null;

self.onmessage = async (e: MessageEvent) => {
	const msg = e.data;
	try {
		switch (msg.type) {
			case 'init': {
				const mod = await import(/* @vite-ignore */ msg.wasmUrl);
				await mod.default();
				mod.init();
				wasm = mod;
				self.postMessage({ type: 'ready' });
				break;
			}

			case 'get_config': {
				const result = wasm.get_speaker_config(
					msg.samples,
					msg.sampleRate,
					msg.configJson
				);
				self.postMessage({ type: 'config', result });
				break;
			}

			case 'run': {
				let lastProgressTime = 0;
				let lastStage = '';
				const progressCb = (fraction: number, stage: string) => {
					const now = performance.now();
					if (now - lastProgressTime > 50 || stage !== lastStage) {
						self.postMessage({ type: 'progress', fraction, stage });
						lastProgressTime = now;
						lastStage = stage;
					}
				};

				const start = performance.now();
				const result = wasm.run_formantwise_intervals(
					msg.samples,
					msg.sampleRate,
					msg.intervals,
					msg.configJson,
					progressCb
				);
				const elapsed = performance.now() - start;
				self.postMessage({ type: 'result', result, elapsed });
				break;
			}
		}
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		self.postMessage({ type: 'error', message });
	}
};
