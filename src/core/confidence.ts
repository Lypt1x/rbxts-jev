/** Confidence formulas published by TypeSafe. Used to derive a missing
 * `confidence` field and exported so game code can compute its own measures. */

export function clamp01(value: number): number {
	if (value !== value) {
		return 0;
	}
	if (value < 0) {
		return 0;
	}
	if (value > 1) {
		return 1;
	}
	return value;
}

function countOf(values: ReadonlyArray<number>): number {
	let count = 0;
	for (const _ of values) {
		count += 1;
	}
	return count;
}

function maxOf(values: ReadonlyArray<number>): number {
	let max = 0;
	let first = true;
	for (const value of values) {
		if (first || value > max) {
			max = value;
			first = false;
		}
	}
	return max;
}

/** `(pMax - 1/n) / (1 - 1/n)`. An even split is 0, certainty is 1. */
export function choiceConfidence(probabilities: ReadonlyArray<number>): number {
	const n = countOf(probabilities);
	if (n <= 1) {
		return 1;
	}
	const peak = maxOf(probabilities);
	return clamp01((peak - 1 / n) / (1 - 1 / n));
}

/** Probability-weighted distance from the most likely level, normalized by the
 * same distance for an even spread. */
export function scoreConfidence(probabilities: ReadonlyArray<number>): number {
	const n = countOf(probabilities);
	if (n <= 1) {
		return 1;
	}
	let peakIndex = 0;
	let peak = 0;
	let index = 0;
	for (const value of probabilities) {
		if (value > peak) {
			peak = value;
			peakIndex = index;
		}
		index += 1;
	}
	let spread = 0;
	index = 0;
	for (const value of probabilities) {
		const distance = index - peakIndex;
		spread += value * (distance < 0 ? -distance : distance);
		index += 1;
	}
	let evenSpread = 0;
	index = 0;
	for (const _ of probabilities) {
		const distance = index - (n - 1) / 2;
		evenSpread += distance < 0 ? -distance : distance;
		index += 1;
	}
	evenSpread = evenSpread / n;
	if (evenSpread === 0) {
		return 1;
	}
	return clamp01(1 - spread / evenSpread);
}

/** A Noul has two outcomes, so `|2p - 1|` puts it on the same scale as Choice. */
export function noulConfidence(probability: number): number {
	return clamp01(probability * 2 - 1);
}
