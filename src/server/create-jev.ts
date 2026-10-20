import { createEngine, type AskOptions, type EngineStats, type JevEvent } from "../core/engine";
import { JevError } from "../core/errors";
import type { JsonValue } from "../core/json";
import {
	describeQuestionSet,
	formatDefinition,
	type DefinitionSummary,
	type QuestionMap,
	type QuestionSet,
} from "../core/questions";
import type { Result } from "../core/result";
import type { AskResult } from "../core/answers";
import { createRobloxCodec, createRobloxTransport, plainAuthorization, resolveSecret } from "./transport";
import { exposeJev } from "./expose";
import type { ExposeOptions, Exposed, ExposedSets, Jev, JevOptions } from "./types";

const DEFAULT_BASE_URL = "https://api.typesafe.ai";
const DEFAULT_MODEL = "jev-latest";

function authorizationHeader(options: JevOptions): string | Secret {
	if (options.apiKeySecret !== undefined) {
		return resolveSecret(options.apiKeySecret);
	}
	if (options.apiKey !== undefined && options.apiKey !== "") {
		return plainAuthorization(options.apiKey);
	}
	throw new JevError({
		kind: "auth",
		message: "Pass `apiKeySecret` (recommended) or `apiKey` to createJev.",
	});
}

/** Safe to import on the client; module scope touches no services. Call it on the
 * server, because constructing the client reads the secret immediately. */
export function createJev(options: JevOptions): Jev {
	const authorization = authorizationHeader(options);
	const clock = {
		now: () => os.clock() * 1000,
		sleep: (milliseconds: number) =>
			new Promise<void>((resolve) => {
				task.delay(milliseconds / 1000, resolve);
			}),
	};

	const definitions = new Array<DefinitionSummary>();
	const definedNames = new Set<string>();
	const printedNames = new Set<string>();

	function register(set: QuestionSet<QuestionMap, string>): DefinitionSummary {
		if (!definedNames.has(set.name)) {
			definedNames.add(set.name);
			const summary = describeQuestionSet(set);
			definitions.push(summary);
			return summary;
		}
		for (const summary of definitions) {
			if (summary.name === set.name) {
				return summary;
			}
		}
		const summary = describeQuestionSet(set);
		definitions.push(summary);
		return summary;
	}

	const debug = options.debug === true;
	const onEvent = (event: JevEvent): void => {
		if (debug) {
			if (event.type === "retry") {
				warn(`[jev] retry ${event.attempt + 1} for "${event.setName}" in ${event.delayMs}ms (${event.kind})`);
			} else if (event.type === "error") {
				warn(`[jev] ${event.error.toString()}`);
			}
		}
		if (options.onEvent !== undefined) {
			try {
				options.onEvent(event);
			} catch (caught) {
				warn(`[jev] event listener threw: ${tostring(caught)}`);
			}
		}
	};

	const engine = createEngine({
		model: options.model ?? DEFAULT_MODEL,
		baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
		timeoutMs: options.timeoutMs ?? 12000,
		retries: options.retries ?? 2,
		requestsPerMinute: options.requestsPerMinute ?? 240,
		burst: options.burst ?? 24,
		maxConcurrent: options.maxConcurrent ?? 4,
		cacheTtlMs: options.cacheTtlMs ?? 0,
		cacheMaxEntries: options.cacheMaxEntries ?? 256,
		transport: createRobloxTransport(),
		codec: createRobloxCodec(),
		clock,
		random: () => math.random(),
		hashReader: {
			length: (text: string) => text.size(),
			codeAt: (text: string, index: number) => {
				const [code] = string.byte(text, index);
				return code ?? 0;
			},
		},
		headers: (needsImages: boolean) => {
			const headers: { [key: string]: unknown } = {};
			headers["content-type"] = "application/json";
			headers.authorization = authorization;
			if (needsImages) {
				headers["typesafe-danger-zone-images"] = "true";
			}
			return headers;
		},
		onEvent,
	});

	function previewOne(summary: DefinitionSummary): string {
		return formatDefinition(summary);
	}

	function track(set: QuestionSet<QuestionMap, string>): void {
		const summary = register(set);
		if (debug && !printedNames.has(set.name)) {
			printedNames.add(set.name);
			print(previewOne(summary));
		}
	}

	const jev: Jev = {
		async ask<Q extends QuestionMap>(
			state: JsonValue,
			set: QuestionSet<Q>,
			askOptions?: AskOptions,
		): Promise<AskResult<Q>> {
			track(set as unknown as QuestionSet<QuestionMap, string>);
			return engine.ask(state, set, askOptions);
		},
		async attempt<Q extends QuestionMap>(
			state: JsonValue,
			set: QuestionSet<Q>,
			askOptions?: AskOptions,
		): Promise<Result<AskResult<Q>, JevError>> {
			track(set as unknown as QuestionSet<QuestionMap, string>);
			return engine.attempt(state, set, askOptions);
		},
		async attemptAll<Q extends QuestionMap>(
			states: ReadonlyArray<JsonValue>,
			set: QuestionSet<Q>,
			askOptions?: AskOptions,
		): Promise<ReadonlyArray<Result<AskResult<Q>, JevError>>> {
			track(set as unknown as QuestionSet<QuestionMap, string>);
			return engine.attemptAll(states, set, askOptions);
		},
		define<Q extends QuestionMap, N extends string>(set: QuestionSet<Q, N>): QuestionSet<Q, N> {
			const summary = register(set as unknown as QuestionSet<QuestionMap, string>);
			if (debug) {
				print(previewOne(summary));
			}
			return set;
		},
		definitions(): ReadonlyArray<DefinitionSummary> {
			return definitions;
		},
		preview(name?: string): string {
			if (name === undefined) {
				const parts = new Array<string>();
				for (const summary of definitions) {
					parts.push(previewOne(summary));
				}
				return parts.join("\n\n");
			}
			for (const summary of definitions) {
				if (summary.name === name) {
					return previewOne(summary);
				}
			}
			return `No question set named "${name}".`;
		},
		stats(): EngineStats {
			return engine.stats();
		},
		clearCache(): void {
			engine.clearCache();
		},
		expose<E extends ExposedSets>(sets: E, exposeOptions?: ExposeOptions): Exposed<E> {
			for (const [, set] of pairs(sets as unknown as { [key: string]: defined })) {
				register(set as unknown as QuestionSet<QuestionMap, string>);
			}
			return exposeJev(jev, sets, exposeOptions);
		},
	};

	return jev;
}
