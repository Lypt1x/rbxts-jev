import type { JevErrorKind } from "./errors";

export interface BackoffOptions {
	readonly baseMs: number;
	readonly maxMs: number;
	readonly random: () => number;
}

function floorNonNegative(value: number): number {
	const truncated = value - (value % 1);
	return truncated < 0 ? 0 : truncated;
}

/** Full jitter. Roblox's own guidance is exponential backoff; jitter keeps many
 * game servers from retrying in lockstep. */
export function backoffDelay(attempt: number, options: BackoffOptions): number {
	let ceiling = options.baseMs;
	for (let index = 0; index < attempt; index += 1) {
		ceiling *= 2;
		if (ceiling >= options.maxMs) {
			ceiling = options.maxMs;
			break;
		}
	}
	return floorNonNegative(options.random() * ceiling);
}

export function isRetryable(kind: JevErrorKind): boolean {
	return kind === "rate_limit" || kind === "overloaded" || kind === "timeout" || kind === "network" || kind === "server";
}

/** Reads `retry-after` in seconds. HTTP-date form is ignored; the backoff then
 * uses its own schedule. */
export function parseRetryAfter(headers: { readonly [key: string]: unknown }): number | undefined {
	for (const [key, value] of pairs(headers as { [key: string]: defined })) {
		const name = tostring(key);
		if (name !== "retry-after") {
			continue;
		}
		if (!typeIs(value, "string") && !typeIs(value, "number")) {
			return undefined;
		}
		const seconds = tonumber(value);
		if (seconds === undefined || seconds !== seconds || seconds < 0) {
			return undefined;
		}
		return floorNonNegative(seconds * 1000);
	}
	return undefined;
}
