/** Deterministic string key without bitwise operators or hashing libraries.
 * Two lanes reduce collisions for cache and single-flight keys. The hash is
 * process-local; it is never persisted or sent. */
const LANE_A = 1000003;
const LANE_B = 1000033;
const MODULUS = 2147483647;

export interface CharReader {
	readonly length: (text: string) => number;
	readonly codeAt: (text: string, index: number) => number;
}

export function hashKey(parts: ReadonlyArray<string>, reader: CharReader): string {
	let a = 2166136261 % MODULUS;
	let b = 3735928559 % MODULUS;

	for (const part of parts) {
		const length = reader.length(part);
		for (let index = 1; index <= length; index += 1) {
			const code = reader.codeAt(part, index);
			a = (a * LANE_A + code) % MODULUS;
			b = (b * LANE_B + code) % MODULUS;
		}
		a = (a * LANE_A + 124) % MODULUS;
		b = (b * LANE_B + 124) % MODULUS;
	}

	return `${tostring(a)}:${tostring(b)}`;
}
