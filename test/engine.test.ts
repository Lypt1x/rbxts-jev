import { describe, expect, test } from "bun:test";
import { createEngine, type EngineConfig } from "../src/core/engine";
import { questions, choice, noul } from "../src/core/questions";
import type { HttpRequest, HttpResponse, HttpTransport } from "../src/core/transport";

const set = questions("ticket", {
	department: choice("Which team?", { billing: "Money", technical: "Bugs" }),
	wantsHuman: noul("Wants a human?"),
});

const body = {
	model: "jev-latest",
	answers: {
		department: { type: "choice", choice: "billing", confidence: 0.9, probabilities: { billing: 0.9, technical: 0.1 } },
		wantsHuman: { type: "noul", noul: 0.2 },
	},
	usage: { input_tokens: 10, output_tokens: 2 },
};

function response(status = 200, value: unknown = body, headers: Record<string, string> = {}): HttpResponse {
	return { status, body: JSON.stringify(value), headers };
}

class FakeTransport implements HttpTransport {
	public readonly requests: Array<HttpRequest> = [];
	private readonly queue: Array<HttpResponse | Error>;

	public constructor(...responses: Array<HttpResponse | Error>) {
		this.queue = responses;
	}

	public async request(request: HttpRequest): Promise<HttpResponse> {
		this.requests.push(request);
		const next = this.queue.shift();
		if (next === undefined) {
			throw new Error("FakeTransport ran out of responses");
		}
		if (next instanceof Error) {
			throw next;
		}
		return next;
	}
}

function makeClock() {
	let now = 0;
	return {
		now: () => now,
		sleep: async (milliseconds: number) => {
			now += milliseconds;
		},
	};
}

function makeConfig(transport: HttpTransport, overrides: Partial<EngineConfig> = {}): EngineConfig {
	return {
		model: "jev-latest",
		baseUrl: "https://api.typesafe.ai",
		timeoutMs: 1000,
		retries: 2,
		requestsPerMinute: 60000,
		burst: 10,
		maxConcurrent: 2,
		cacheTtlMs: 0,
		cacheMaxEntries: 10,
		transport,
		codec: { encode: (value) => JSON.stringify(value), decode: (text) => JSON.parse(text) },
		clock: makeClock(),
		random: () => 0,
		hashReader: { length: (text) => text.length, codeAt: (text, index) => text.charCodeAt(index - 1) },
		headers: () => ({ authorization: "Bearer test" }),
		...overrides,
	};
}

describe("engine", () => {
	test("posts the model, state, and wire questions", async () => {
		const transport = new FakeTransport(response());
		const engine = createEngine(makeConfig(transport));
		const result = await engine.ask({ message: "help" }, set);

		expect(transport.requests).toHaveLength(1);
		const request = transport.requests[0];
		expect(request.url).toBe("https://api.typesafe.ai/v1/systemone");
		expect(request.headers.authorization).toBe("Bearer test");
		const parsed = JSON.parse(request.body);
		expect(parsed.model).toBe("jev-latest");
		expect(parsed.state).toEqual({ message: "help" });
		expect(parsed.questions.department.type).toBe("choice");
		expect(parsed.questions.wantsHuman.type).toBe("noul");
		expect(result.answers.department.choice).toBe("billing");
		expect(result.cached).toBe(false);
	});

	test("maps 401 to an auth error and does not retry", async () => {
		const transport = new FakeTransport(response(401, { detail: "bad key" }));
		const engine = createEngine(makeConfig(transport));
		await expect(engine.ask("hi", set)).rejects.toMatchObject({ kind: "auth" });
		expect(transport.requests).toHaveLength(1);
	});

	test("retries a 429 and honors retry-after", async () => {
		const transport = new FakeTransport(response(429, {}, { "retry-after": "0" }), response());
		const engine = createEngine(makeConfig(transport));
		const result = await engine.ask("hi", set);
		expect(result.answers.wantsHuman.noul).toBe(0.2);
		expect(transport.requests).toHaveLength(2);
		expect(engine.stats().retries).toBe(1);
	});

	test("gives up after the configured retries", async () => {
		const transport = new FakeTransport(response(500), response(500), response(500));
		const engine = createEngine(makeConfig(transport));
		await expect(engine.ask("hi", set)).rejects.toMatchObject({ kind: "server" });
		expect(transport.requests).toHaveLength(3);
	});

	test("collapses concurrent identical calls into one request", async () => {
		let release: ((value: HttpResponse) => void) | undefined;
		const transport: HttpTransport = {
			request: () =>
				new Promise<HttpResponse>((resolve) => {
					release = resolve;
				}),
		};
		const engine = createEngine(makeConfig(transport, { timeoutMs: 0 }));
		const first = engine.ask("same", set);
		const second = engine.ask("same", set);
		await new Promise((resolve) => setTimeout(resolve, 5));
		release?.(response());
		const [a, b] = await Promise.all([first, second]);
		expect(a.answers.department.choice).toBe("billing");
		expect(b.answers.department.choice).toBe("billing");
		expect(engine.stats().dedupes).toBe(1);
	});

	test("serves a repeated call from the cache when a TTL is set", async () => {
		const transport = new FakeTransport(response());
		const engine = createEngine(makeConfig(transport, { cacheTtlMs: 1000 }));
		await engine.ask("same", set);
		const second = await engine.ask("same", set);
		expect(transport.requests).toHaveLength(1);
		expect(second.cached).toBe(true);
		expect(engine.stats().cacheHits).toBe(1);
	});

	test("emits request, response, retry, and error events in order", async () => {
		const events: Array<string> = [];
		const transport = new FakeTransport(response(500), response(401));
		const engine = createEngine(
			makeConfig(transport, {
				retries: 1,
				onEvent: (event) => events.push(event.type === "response" ? `response:${event.status}` : event.type),
			}),
		);
		await expect(engine.ask("hi", set)).rejects.toMatchObject({ kind: "auth" });
		expect(events).toEqual(["request", "response:500", "retry", "request", "response:401", "error"]);
	});

	test("does not cache by default", async () => {
		const transport = new FakeTransport(response(), response());
		const engine = createEngine(makeConfig(transport));
		await engine.ask("same", set);
		await engine.ask("same", set);
		expect(transport.requests).toHaveLength(2);
	});

	test("times out instead of hanging", async () => {
		const transport: HttpTransport = { request: () => new Promise<HttpResponse>(() => undefined) };
		const engine = createEngine(makeConfig(transport, { retries: 0 }));
		await expect(engine.ask("hi", set)).rejects.toMatchObject({ kind: "timeout" });
	});

	test("reports a malformed body as a typed error", async () => {
		const transport = new FakeTransport(response(200, { nonsense: true }));
		const engine = createEngine(makeConfig(transport, { retries: 0 }));
		await expect(engine.ask("hi", set)).rejects.toMatchObject({ kind: "malformed_response" });
	});

	test("attempt returns a Result instead of rejecting", async () => {
		const transport = new FakeTransport(response(401));
		const engine = createEngine(makeConfig(transport));
		const result = await engine.attempt("hi", set);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("auth");
	});

	test("attemptAll runs one call per state and never rejects", async () => {
		const transport = new FakeTransport(response(), response(500), response());
		const engine = createEngine(makeConfig(transport, { retries: 0 }));
		const results = await engine.attemptAll(["a", "b", "c"], set);
		expect(results).toHaveLength(3);
		expect(results[0].ok).toBe(true);
		expect(results[1].ok).toBe(false);
		expect(results[2].ok).toBe(true);
	});

	test("rejects a non-serializable state with a validation error", async () => {
		const transport = new FakeTransport(response());
		const engine = createEngine(
			makeConfig(transport, {
				codec: {
					encode: () => {
						throw new Error("cannot encode");
					},
					decode: (text) => JSON.parse(text),
				},
			}),
		);
		await expect(engine.ask("hi", set)).rejects.toMatchObject({ kind: "validation" });
		expect(transport.requests).toHaveLength(0);
	});
});
