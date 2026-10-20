export interface TtlCache<T> {
	get(key: string): T | undefined;
	set(key: string, value: T): void;
	clear(): void;
}

interface Entry<T> {
	readonly value: T;
	readonly expiresAt: number;
	readonly generation: number;
}

interface OrderRecord {
	readonly key: string;
	readonly generation: number;
}

/** Small TTL cache with insertion-order eviction. Caching judged answers is
 * opt-in because a stale judgment about a player is a gameplay bug. */
export function createTtlCache<T>(ttlMs: number, maxEntries: number, now: () => number): TtlCache<T> {
	const entries = new Map<string, Entry<T>>();
	const order = new Array<OrderRecord>();
	let orderCount = 0;
	let nextGeneration = 0;
	const limit = maxEntries > 1 ? maxEntries : 1;

	function evictIfNeeded(): void {
		while (orderCount > limit) {
			const oldest = order.shift();
			if (oldest !== undefined) {
				const current = entries.get(oldest.key);
				// `expiresAt` can repeat within a millisecond; the generation cannot.
				if (current !== undefined && current.generation === oldest.generation) {
					entries.delete(oldest.key);
				}
			}
			orderCount -= 1;
		}
	}

	return {
		get(key: string): T | undefined {
			const entry = entries.get(key);
			if (entry === undefined) {
				return undefined;
			}
			if (entry.expiresAt <= now()) {
				entries.delete(key);
				return undefined;
			}
			return entry.value;
		},
		set(key: string, value: T): void {
			if (ttlMs <= 0) {
				return;
			}
			const generation = nextGeneration;
			nextGeneration += 1;
			const expiresAt = now() + ttlMs;
			entries.set(key, { value, expiresAt, generation });
			order.push({ key, generation });
			orderCount += 1;
			evictIfNeeded();
		},
		clear(): void {
			entries.clear();
			let removed = order.shift();
			while (removed !== undefined) {
				removed = order.shift();
			}
			orderCount = 0;
		},
	};
}

export interface SingleFlight<T> {
	run(key: string, task: () => Promise<T>): Promise<T>;
	has(key: string): boolean;
}

/** Collapses concurrent identical requests into one. This is always on; it is
 * the cheapest way to protect the server's HTTP budget. */
export function createSingleFlight<T>(): SingleFlight<T> {
	const inFlight = new Map<string, Promise<T>>();

	return {
		has(key: string): boolean {
			return inFlight.get(key) !== undefined;
		},
		run(key: string, task: () => Promise<T>): Promise<T> {
			const existing = inFlight.get(key);
			if (existing !== undefined) {
				return existing;
			}
			const started = task();
			inFlight.set(key, started);
			started.then(
				() => inFlight.delete(key),
				() => inFlight.delete(key),
			);
			return started;
		},
	};
}
