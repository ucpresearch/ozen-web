/**
 * TextGrid-to-intervals conversion with vowel pattern filtering.
 */

import type { Tier } from '$lib/types';
import type { ParsedIntervals } from './types';

/** ARPABET vowel pattern with optional stress digit. */
export const ARPABET_VOWELS = /^(AA|AE|AH|AO|AW|AX|AY|EH|ER|EY|IH|IY|OW|OY|UH|UW)[0-9]?$/i;

/** IPA vowel pattern — matches labels starting with an IPA vowel character (allows trailing diacritics, length marks, diphthongs). */
export const IPA_VOWELS = /^[iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ]/;

/**
 * Filter intervals from a TextGrid tier by vowel pattern and min duration,
 * producing a ParsedIntervals ready for the WASM pipeline.
 */
export function textGridToIntervals(
	tiers: Tier[],
	tierName: string,
	pattern: RegExp,
	minDuration: number
): ParsedIntervals {
	const tier = tiers.find((t) => t.name === tierName);
	if (!tier) {
		throw new Error(`Tier "${tierName}" not found`);
	}

	const headers = ['label', 'tier', 'start', 'end'];
	const rows: Record<string, string>[] = [];
	const startValues: number[] = [];
	const endValues: number[] = [];

	for (const interval of tier.intervals) {
		const text = interval.text.trim();
		if (!text) continue;
		if (!pattern.test(text)) continue;
		const dur = interval.end - interval.start;
		if (dur < minDuration) continue;

		rows.push({
			label: text,
			tier: tierName,
			start: String(interval.start),
			end: String(interval.end)
		});
		startValues.push(interval.start);
		endValues.push(interval.end);
	}

	const intervals = new Float64Array(rows.length * 2);
	for (let i = 0; i < rows.length; i++) {
		intervals[i * 2] = startValues[i];
		intervals[i * 2 + 1] = endValues[i];
	}

	return { headers, rows, intervals, source: 'textgrid' };
}
