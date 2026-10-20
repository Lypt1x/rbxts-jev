export interface Clock {
	/** Monotonic milliseconds. */
	readonly now: () => number;
	readonly sleep: (milliseconds: number) => Promise<void>;
}

function atLeastOne(value: number): number {
	return value > 1 ? value : 1;
}

export interface RateLimiter {
	/** Resolves when one request may be sent. */
	acquire(): Promise<void>;
}

/** Leaky bucket, the shape Roblox recommends for outbound HTTP. `capacity` is the
 * burst size; `requestsPerMinute` is the sustained rate. */
export function createRateLimiter(requestsPerMinute: number, capacity: number, clock: Clock): RateLimiter {
	const refillPerMs = atLeastOne(requestsPerMinute) / 60000;
	const burst = atLeastOne(capacity);
	let level = 0;
	let last = clock.now();
	let tail: Promise<void> = Promise.resolve();

	function leak(): void {
		const instant = clock.now();
		const elapsed = instant - last;
		if (elapsed > 0) {
			const drained = level - elapsed * refillPerMs;
			level = drained < 0 ? 0 : drained;
			last = instant;
		}
	}

	async function acquireOnce(): Promise<void> {
		leak();
		while (level + 1 > burst) {
			const waitMs = (level + 1 - burst) / refillPerMs;
			await clock.sleep(waitMs > 1 ? waitMs : 1);
			leak();
		}
		level += 1;
	}

	return {
		acquire(): Promise<void> {
			const following = tail.then(acquireOnce);
			tail = following.then(
				() => undefined,
				() => undefined,
			);
			return following;
		},
	};
}

export interface Semaphore {
	/** Resolves with a release function. Always call it, including on failure. */
	acquire(): Promise<() => void>;
}

export function createSemaphore(max: number): Semaphore {
	const limit = atLeastOne(max);
	let active = 0;
	const waiters = new Array<() => void>();

	function release(): void {
		active -= 1;
		const queued = waiters.shift();
		if (queued !== undefined) {
			queued();
		}
	}

	return {
		acquire(): Promise<() => void> {
			if (active < limit) {
				active += 1;
				return Promise.resolve(release);
			}
			return new Promise<() => void>((resolve) => {
				waiters.push(() => {
					active += 1;
					resolve(release);
				});
			});
		},
	};
}
