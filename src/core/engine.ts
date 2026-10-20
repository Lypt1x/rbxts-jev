import { parseSystemOneResponse, type AskResult } from "./answers";
import { createSingleFlight, createTtlCache, type SingleFlight, type TtlCache } from "./cache";
import { JevError, isJevError, toJevError } from "./errors";
import { backoffDelay, isRetryable, parseRetryAfter } from "./retry";
import { hashKey, type CharReader } from "./hash";
import type { JsonObject, JsonValue } from "./json";
import type { QuestionMap, QuestionSet } from "./questions";
import { questionSetNeedsImages, toWireQuestions } from "./questions";
import { err, ok, type Result } from "./result";
import { createRateLimiter, createSemaphore, type Clock } from "./scheduler";
import type { HttpTransport, JsonCodec } from "./transport";

export interface AskOptions {
	/** Overrides the client's default model for this call. An alias moves between
	 * releases, so pin a version when thresholds are tuned. */
	readonly model?: string;
	readonly timeoutMs?: number;
	/** Image assets keyed by the placeholder used in the state. Each value is the
	 * API's asset object, for example `{ type: "image", format: "png", data_base64: "..." }`. */
	readonly assets?: JsonObject;
}

export type JevEvent =
	| { readonly type: "request"; readonly setName: string; readonly attempt: number }
	| { readonly type: "response"; readonly setName: string; readonly status: number; readonly latencyMs: number }
	| { readonly type: "retry"; readonly setName: string; readonly attempt: number; readonly delayMs: number; readonly kind: string }
	| { readonly type: "cache_hit"; readonly setName: string }
	| { readonly type: "error"; readonly setName: string; readonly error: JevError };

export interface EngineStats {
	readonly requests: number;
	readonly retries: number;
	readonly cacheHits: number;
	readonly dedupes: number;
	readonly errors: number;
}

export interface EngineConfig {
	readonly model: string;
	readonly baseUrl: string;
	readonly timeoutMs: number;
	readonly retries: number;
	readonly requestsPerMinute: number;
	readonly burst: number;
	readonly maxConcurrent: number;
	readonly cacheTtlMs: number;
	readonly cacheMaxEntries: number;
	readonly transport: HttpTransport;
	readonly codec: JsonCodec;
	readonly clock: Clock;
	readonly random: () => number;
	readonly hashReader: CharReader;
	readonly headers: (needsImages: boolean) => { readonly [key: string]: unknown };
	readonly onEvent?: (event: JevEvent) => void;
}

export interface JevEngine {
	ask<Q extends QuestionMap>(state: JsonValue, set: QuestionSet<Q>, options?: AskOptions): Promise<AskResult<Q>>;
	attempt<Q extends QuestionMap>(
		state: JsonValue,
		set: QuestionSet<Q>,
		options?: AskOptions,
	): Promise<Result<AskResult<Q>, JevError>>;
	/** Runs one call per state and never rejects. `Promise.all` on raw `ask` calls
	 * would cancel the siblings after the first failure. */
	attemptAll<Q extends QuestionMap>(
		states: ReadonlyArray<JsonValue>,
		set: QuestionSet<Q>,
		options?: AskOptions,
	): Promise<ReadonlyArray<Result<AskResult<Q>, JevError>>>;
	stats(): EngineStats;
	clearCache(): void;
}

const MAX_DETAIL = 512;

function buildBody<Q extends QuestionMap>(
	state: JsonValue,
	set: QuestionSet<Q>,
	model: string,
	assets: JsonObject | undefined,
): JsonObject {
	const body: { [key: string]: JsonValue } = {};
	body.model = model;
	body.state = state;
	body.questions = toWireQuestions(set);
	if (assets !== undefined) {
		body.assets = assets;
	}
	return body;
}

function truncate(text: string): string {
	let out = "";
	let count = 0;
	for (const character of text) {
		if (count >= MAX_DETAIL) {
			return `${out}...`;
		}
		out += character;
		count += 1;
	}
	return out;
}

export function errorForResponse(status: number, body: string, headers: { readonly [key: string]: unknown }): JevError {
	const retryAfterMs = parseRetryAfter(headers);
	const detail = truncate(body);
	if (status === 401 || status === 403) {
		return new JevError({
			kind: "auth",
			status,
			message: "TypeSafe rejected the API key. Check the secret named in the client config.",
			detail,
		});
	}
	if (status === 429) {
		return new JevError({
			kind: "rate_limit",
			status,
			retryAfterMs,
			message: "TypeSafe rate limit reached.",
			detail,
		});
	}
	if (status === 529) {
		return new JevError({ kind: "overloaded", status, retryAfterMs, message: "TypeSafe is overloaded.", detail });
	}
	if (status === 400 || status === 413 || status === 415 || status === 422) {
		return new JevError({ kind: "validation", status, message: "TypeSafe rejected the request body.", detail });
	}
	if (status >= 500) {
		return new JevError({ kind: "server", status, retryAfterMs, message: "TypeSafe returned a server error.", detail });
	}
	return new JevError({ kind: "server", status, message: `Unexpected status ${status}.`, detail });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, clock: Clock): Promise<T> {
	if (timeoutMs <= 0) {
		return promise;
	}
	const timeout = clock.sleep(timeoutMs).then(() => {
		throw new JevError({ kind: "timeout", message: `Request did not finish within ${timeoutMs}ms.` });
	});
	return Promise.race([promise, timeout]);
}

export function createEngine(config: EngineConfig): JevEngine {
	const limiter = createRateLimiter(config.requestsPerMinute, config.burst, config.clock);
	const semaphore = createSemaphore(config.maxConcurrent);
	const cache: TtlCache<AskResult<QuestionMap>> = createTtlCache(
		config.cacheTtlMs,
		config.cacheMaxEntries,
		config.clock.now,
	);
	const singleFlight: SingleFlight<AskResult<QuestionMap>> = createSingleFlight();

	let requests = 0;
	let retries = 0;
	let cacheHits = 0;
	let dedupes = 0;
	let errors = 0;

	function emit(event: JevEvent): void {
		if (config.onEvent === undefined) {
			return;
		}
		try {
			config.onEvent(event);
		} catch (caught) {
			warn(`jev: event listener threw: ${tostring(caught)}`);
		}
	}

	async function send(encoded: string, needsImages: boolean, timeoutMs: number, setName: string): Promise<string> {
		const request = {
			url: `${config.baseUrl}/v1/systemone`,
			headers: config.headers(needsImages),
			body: encoded,
			timeoutMs,
		};

		let attempt = 0;
		while (true) {
			await limiter.acquire();
			const release = await semaphore.acquire();
			let response: { readonly status: number; readonly body: string; readonly headers: { readonly [key: string]: unknown } } | undefined;
			let failure: JevError | undefined;

			emit({ type: "request", setName, attempt });
			requests += 1;
			const sentAt = config.clock.now();
			try {
				response = await withTimeout(config.transport.request(request), timeoutMs, config.clock);
			} catch (caught) {
				failure = toJevError(caught);
			} finally {
				release();
			}

			if (response !== undefined) {
				const elapsed = config.clock.now() - sentAt;
				emit({ type: "response", setName, status: response.status, latencyMs: elapsed - (elapsed % 1) });
				if (response.status >= 200 && response.status < 300) {
					return response.body;
				}
				failure = errorForResponse(response.status, response.body, response.headers);
			}

			const problem = failure ?? new JevError({ kind: "unknown", message: "No response and no error." });
			if (!isRetryable(problem.kind) || attempt >= config.retries) {
				errors += 1;
				emit({ type: "error", setName, error: problem });
				throw problem;
			}

			const delay = problem.retryAfterMs ?? backoffDelay(attempt, {
				baseMs: 250,
				maxMs: 8000,
				random: config.random,
			});
			retries += 1;
			emit({ type: "retry", setName, attempt, delayMs: delay, kind: problem.kind });
			await config.clock.sleep(delay);
			attempt += 1;
		}
	}

	async function run<Q extends QuestionMap>(
		state: JsonValue,
		set: QuestionSet<Q>,
		options: AskOptions | undefined,
	): Promise<AskResult<Q>> {
		const startedAt = config.clock.now();
		const elapsedMs = (): number => {
			const delta = config.clock.now() - startedAt;
			return delta - (delta % 1);
		};
		const model = options?.model ?? config.model;
		const timeoutMs = options?.timeoutMs ?? config.timeoutMs;
		const needsImages = questionSetNeedsImages(set) || options?.assets !== undefined;
		const body = buildBody(state, set, model, options?.assets);

		let encoded: string;
		try {
			encoded = config.codec.encode(body);
		} catch (caught) {
			throw new JevError({
				kind: "validation",
				message: "The state or questions are not JSON-serializable.",
				cause: caught,
			});
		}

		const key = hashKey([model, set.name, encoded], config.hashReader);

		const cached = cache.get(key);
		if (cached !== undefined) {
			cacheHits += 1;
			emit({ type: "cache_hit", setName: set.name });
			return {
				answers: cached.answers,
				model: cached.model,
				usage: cached.usage,
				latencyMs: elapsedMs(),
				cached: true,
			} as unknown as AskResult<Q>;
		}

		if (singleFlight.has(key)) {
			dedupes += 1;
		}

		const promise = singleFlight.run(key, async () => {
			const text = await send(encoded, needsImages, timeoutMs, set.name);
			let decoded: unknown;
			try {
				decoded = config.codec.decode(text);
			} catch (caught) {
				throw new JevError({
					kind: "malformed_response",
					message: "TypeSafe returned a body that is not valid JSON.",
					cause: caught,
				});
			}
			const parsed = parseSystemOneResponse(decoded, set);
			if (!parsed.ok) {
				throw parsed.error;
			}
			const result: AskResult<QuestionMap> = {
				answers: parsed.value.answers,
				model: parsed.value.model,
				usage: parsed.value.usage,
				latencyMs: 0,
				cached: false,
			};
			cache.set(key, result);
			return result;
		});

		const result = await promise;
		return { answers: result.answers, model: result.model, usage: result.usage, latencyMs: elapsedMs(), cached: result.cached } as unknown as AskResult<Q>;
	}

	return {
		async ask<Q extends QuestionMap>(
			state: JsonValue,
			set: QuestionSet<Q>,
			options?: AskOptions,
		): Promise<AskResult<Q>> {
			return run(state, set, options);
		},
		async attempt<Q extends QuestionMap>(
			state: JsonValue,
			set: QuestionSet<Q>,
			options?: AskOptions,
		): Promise<Result<AskResult<Q>, JevError>> {
			try {
				return ok(await run(state, set, options));
			} catch (caught) {
				return err(isJevError(caught) ? caught : toJevError(caught));
			}
		},
		async attemptAll<Q extends QuestionMap>(
			states: ReadonlyArray<JsonValue>,
			set: QuestionSet<Q>,
			options?: AskOptions,
		): Promise<ReadonlyArray<Result<AskResult<Q>, JevError>>> {
			const pending = new Array<Promise<Result<AskResult<Q>, JevError>>>();
			for (const state of states) {
				pending.push(run(state, set, options).then(
					(value) => ok(value),
					(caught) => err(isJevError(caught) ? caught : toJevError(caught)),
				));
			}
			return Promise.all(pending) as unknown as Promise<ReadonlyArray<Result<AskResult<Q>, JevError>>>;
		},
		stats(): EngineStats {
			return { requests, retries, cacheHits, dedupes, errors };
		},
		clearCache(): void {
			cache.clear();
		},
	};
}
