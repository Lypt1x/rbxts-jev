import { describe, expect, test } from "bun:test";
import { createSingleFlight, createTtlCache } from "../src/core/cache";
import { createRateLimiter, createSemaphore } from "../src/core/scheduler";

function makeClock() {
	let now = 0;
	return {
		now: () => now,
		sleep: async (milliseconds: number) => {
			now += milliseconds;
		},
		advance: (milliseconds: number) => {
			now += milliseconds;
		},
	};
}

describe("ttl cache", () => {
	test("returns a value before the TTL expires", () => {
		const clock = makeClock();
		const cache = createTtlCache<string>(1000, 4, clock.now);
		cache.set("a", "value");
		expect(cache.get("a")).toBe("value");
		clock.advance(999);
		expect(cache.get("a")).toBe("value");
	});

	test("drops a value after the TTL expires", () => {
		const clock = makeClock();
		const cache = createTtlCache<string>(1000, 4, clock.now);
		cache.set("a", "value");
		clock.advance(1000);
		expect(cache.get("a")).toBeUndefined();
	});

	test("evicts the oldest entry past the limit", () => {
		const clock = makeClock();
		const cache = createTtlCache<string>(10000, 2, clock.now);
		cache.set("a", "a");
		cache.set("b", "b");
		cache.set("c", "c");
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBe("b");
		expect(cache.get("c")).toBe("c");
	});

	test("does not evict a re-set key when an old record is trimmed", () => {
		const clock = makeClock();
		const cache = createTtlCache<string>(10000, 2, clock.now);
		cache.set("a", "old");
		cache.set("b", "b");
		clock.advance(1);
		cache.set("a", "new");
		expect(cache.get("a")).toBe("new");
		expect(cache.get("b")).toBe("b");
	});

	test("a same-millisecond re-set keeps the live entry", () => {
		const cache = createTtlCache<string>(10000, 1, () => 0);
		cache.set("a", "old");
		cache.set("a", "new");
		expect(cache.get("a")).toBe("new");
	});

	test("stores nothing when the TTL is zero", () => {
		const clock = makeClock();
		const cache = createTtlCache<string>(0, 4, clock.now);
		cache.set("a", "value");
		expect(cache.get("a")).toBeUndefined();
	});
});

describe("single flight", () => {
	test("shares one promise between concurrent callers", async () => {
		const flight = createSingleFlight<string>();
		let calls = 0;
		const task = async () => {
			calls += 1;
			return "value";
		};
		const [a, b] = await Promise.all([flight.run("k", task), flight.run("k", task)]);
		expect(a).toBe("value");
		expect(b).toBe("value");
		expect(calls).toBe(1);
	});

	test("forgets the key once it settles", async () => {
		const flight = createSingleFlight<string>();
		await flight.run("k", async () => "value");
		expect(flight.has("k")).toBe(false);
	});
});

describe("rate limiter", () => {
	test("allows the burst, then waits for a refill", async () => {
		const clock = makeClock();
		const limiter = createRateLimiter(60, 1, clock);
		await limiter.acquire();
		await limiter.acquire();
		expect(clock.now()).toBeGreaterThanOrEqual(1000);
	});

	test("does not wait while tokens remain", async () => {
		const clock = makeClock();
		const limiter = createRateLimiter(60, 3, clock);
		await limiter.acquire();
		await limiter.acquire();
		await limiter.acquire();
		expect(clock.now()).toBe(0);
	});
});

describe("semaphore", () => {
	test("bounds concurrent holders", async () => {
		const semaphore = createSemaphore(2);
		const releaseA = await semaphore.acquire();
		await semaphore.acquire();
		let thirdHeld = false;
		const third = semaphore.acquire().then((release) => {
			thirdHeld = true;
			return release;
		});
		await Promise.resolve();
		expect(thirdHeld).toBe(false);
		releaseA();
		const releaseC = await third;
		expect(thirdHeld).toBe(true);
		releaseC();
	});
});
