<script lang="ts">
	import { hoverPosition, cursorPosition } from '$lib/stores/view';
	import { analysisResults } from '$lib/stores/analysis';
	import { tiers, selectedTierIndex } from '$lib/stores/annotations';

	// Use hover position if available, otherwise cursor position
	$: time = $hoverPosition !== null ? $hoverPosition : $cursorPosition;

	// Find closest time index in analysis results
	function getValueAtTime<T>(values: T[], times: number[], t: number): T | null {
		if (!values || !times || times.length === 0) return null;

		// Binary search for closest time
		let lo = 0;
		let hi = times.length - 1;

		while (lo < hi) {
			const mid = Math.floor((lo + hi) / 2);
			if (times[mid] < t) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}

		// Check which of lo or lo-1 is closer
		if (lo > 0 && Math.abs(times[lo - 1] - t) < Math.abs(times[lo] - t)) {
			lo = lo - 1;
		}

		return values[lo];
	}

	// Get interval text at time for all tiers
	function getIntervalsAtTime(t: number): { tierName: string; text: string }[] {
		if (!$tiers || $tiers.length === 0) return [];

		const results: { tierName: string; text: string }[] = [];
		for (const tier of $tiers) {
			const interval = tier.intervals.find(i => t >= i.start && t < i.end);
			if (interval && interval.text) {
				results.push({ tierName: tier.name, text: interval.text });
			}
		}
		return results;
	}

	function formatHz(val: number | null): string {
		if (val === null) return '—';
		return `${val.toFixed(0)}`;
	}

	function formatHzFull(val: number | null): string {
		if (val === null) return '—';
		return `${val.toFixed(1)} Hz`;
	}

	function formatDb(val: number | null): string {
		if (val === null) return '—';
		return `${val.toFixed(1)} dB`;
	}

	$: pitch = $analysisResults ? getValueAtTime($analysisResults.pitch, $analysisResults.times, time) : null;
	$: intensity = $analysisResults ? getValueAtTime($analysisResults.intensity, $analysisResults.times, time) : null;
	$: f1 = $analysisResults ? getValueAtTime($analysisResults.formants.f1, $analysisResults.times, time) : null;
	$: f2 = $analysisResults ? getValueAtTime($analysisResults.formants.f2, $analysisResults.times, time) : null;
	$: f3 = $analysisResults ? getValueAtTime($analysisResults.formants.f3, $analysisResults.times, time) : null;
	$: f4 = $analysisResults ? getValueAtTime($analysisResults.formants.f4, $analysisResults.times, time) : null;
	$: b1 = $analysisResults ? getValueAtTime($analysisResults.formants.b1, $analysisResults.times, time) : null;
	$: b2 = $analysisResults ? getValueAtTime($analysisResults.formants.b2, $analysisResults.times, time) : null;
	$: b3 = $analysisResults ? getValueAtTime($analysisResults.formants.b3, $analysisResults.times, time) : null;
	$: b4 = $analysisResults ? getValueAtTime($analysisResults.formants.b4, $analysisResults.times, time) : null;
	$: hnr = $analysisResults ? getValueAtTime($analysisResults.harmonicity, $analysisResults.times, time) : null;
	$: cog = $analysisResults?.cog ? getValueAtTime($analysisResults.cog, $analysisResults.times, time) : null;
	$: spectralTilt = $analysisResults?.spectralTilt ? getValueAtTime($analysisResults.spectralTilt, $analysisResults.times, time) : null;
	$: a1p0 = $analysisResults?.a1p0 ? getValueAtTime($analysisResults.a1p0, $analysisResults.times, time) : null;
	$: intervalsInfo = getIntervalsAtTime(time);
</script>

<div class="values-panel">
	<div class="panel-header">
		<span class="time-label">{time.toFixed(3)}s</span>
	</div>

	<div class="section">
		<div class="section-title">Pitch & Voice</div>
		<div class="values-grid">
			<div class="value-row">
				<span class="label pitch-label">F0</span>
				<span class="value">{formatHzFull(pitch)}</span>
			</div>
			<div class="value-row">
				<span class="label intensity-label">Int</span>
				<span class="value">{formatDb(intensity)}</span>
			</div>
			<div class="value-row">
				<span class="label hnr-label">HNR</span>
				<span class="value">{formatDb(hnr)}</span>
			</div>
		</div>
	</div>

	<div class="section">
		<div class="section-title">Formants</div>
		<table class="formant-table">
			<tr>
				<th></th>
				<th>Freq</th>
				<th>BW</th>
			</tr>
			<tr>
				<td class="label f-label">F1</td>
				<td class="value">{formatHz(f1)}</td>
				<td class="value bw">{formatHz(b1)}</td>
			</tr>
			<tr>
				<td class="label f-label">F2</td>
				<td class="value">{formatHz(f2)}</td>
				<td class="value bw">{formatHz(b2)}</td>
			</tr>
			<tr>
				<td class="label f-label">F3</td>
				<td class="value">{formatHz(f3)}</td>
				<td class="value bw">{formatHz(b3)}</td>
			</tr>
			<tr>
				<td class="label f-label">F4</td>
				<td class="value">{formatHz(f4)}</td>
				<td class="value bw">{formatHz(b4)}</td>
			</tr>
		</table>
	</div>

	<div class="section">
		<div class="section-title">Spectral</div>
		<div class="values-grid">
			<div class="value-row">
				<span class="label cog-label">CoG</span>
				<span class="value">{formatHzFull(cog)}</span>
			</div>
			<div class="value-row">
				<span class="label tilt-label">Tilt</span>
				<span class="value">{spectralTilt !== null ? `${spectralTilt.toFixed(1)} dB/oct` : '—'}</span>
			</div>
			<div class="value-row">
				<span class="label nasal-label">A1-P0</span>
				<span class="value">{formatDb(a1p0)}</span>
			</div>
		</div>
	</div>

	{#if intervalsInfo.length > 0}
		<div class="section">
			<div class="section-title">Annotation</div>
			{#each intervalsInfo as info}
				<div class="annotation-row">
					<span class="tier-name">{info.tierName}</span>
					<span class="interval-text">{info.text}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.values-panel {
		background: var(--color-surface);
		border-left: 1px solid var(--color-border);
		padding: 0.5rem;
		min-width: 140px;
		max-width: 160px;
		font-size: 11px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow-y: auto;
	}

	.panel-header {
		border-bottom: 1px solid var(--color-border);
		padding-bottom: 0.35rem;
	}

	.time-label {
		font-family: monospace;
		font-size: 13px;
		color: var(--color-text);
		font-weight: 600;
	}

	.section {
		padding-bottom: 0.35rem;
		border-bottom: 1px solid var(--color-border);
	}

	.section:last-child {
		border-bottom: none;
	}

	.section-title {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--color-text-muted);
		margin-bottom: 0.35rem;
	}

	.values-grid {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.value-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.label {
		font-weight: 500;
		padding: 1px 4px;
		border-radius: 2px;
		font-size: 10px;
	}

	.pitch-label {
		color: #60a5fa;
		background: rgba(96, 165, 250, 0.15);
	}

	.intensity-label {
		color: #4ade80;
		background: rgba(74, 222, 128, 0.15);
	}

	.hnr-label {
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.15);
	}

	.cog-label {
		color: #c084fc;
		background: rgba(192, 132, 252, 0.15);
	}

	.tilt-label {
		color: #22d3ee;
		background: rgba(34, 211, 238, 0.15);
	}

	.nasal-label {
		color: #fb7185;
		background: rgba(251, 113, 133, 0.15);
	}

	.f-label {
		color: #f87171;
		background: rgba(248, 113, 113, 0.15);
	}

	.value {
		font-family: monospace;
		color: var(--color-text-muted);
		font-size: 10px;
	}

	.formant-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 10px;
	}

	.formant-table th {
		font-weight: 500;
		color: var(--color-text-muted);
		text-align: right;
		padding: 1px 4px;
		font-size: 9px;
	}

	.formant-table th:first-child {
		text-align: left;
	}

	.formant-table td {
		padding: 1px 4px;
	}

	.formant-table td.value {
		text-align: right;
	}

	.formant-table td.bw {
		color: var(--color-text-muted);
		opacity: 0.7;
	}

	.annotation-row {
		display: flex;
		gap: 0.35rem;
		margin-bottom: 0.2rem;
	}

	.tier-name {
		color: var(--color-text-muted);
		font-size: 10px;
	}

	.tier-name::after {
		content: ':';
	}

	.interval-text {
		color: var(--color-text);
		font-weight: 500;
	}
</style>
