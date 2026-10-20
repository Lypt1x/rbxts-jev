import type { AnswersOf, AskResult } from "../core/answers";
import type { AskOptions, EngineStats, JevEvent } from "../core/engine";
import type { JevError } from "../core/errors";
import type { JsonValue } from "../core/json";
import type { DefinitionSummary, QuestionMap, QuestionSet } from "../core/questions";
import type { Result } from "../core/result";

/** Options for `createJev`. Every field except the key is optional. */
export interface JevOptions {
	/** Plain API key. Prefer `apiKeySecret` so the key never becomes a string. */
	readonly apiKey?: string;
	/** Name of a Roblox secret created in the Creator Dashboard. The value is read
	 * with `HttpService:GetSecret` and never becomes a printable string. */
	readonly apiKeySecret?: string;
	/** Model id or alias. Defaults to `jev-latest`. An alias moves between releases, so pin a version once you tune thresholds. */
	readonly model?: string;
	/** API origin. Defaults to `https://api.typesafe.ai`. */
	readonly baseUrl?: string;
	/** How long to wait for one attempt before it fails with `timeout`. Defaults to 12000. */
	readonly timeoutMs?: number;
	/** Retries after the first attempt, for 429, 529, 5xx, network, and timeout failures. Defaults to 2. */
	readonly retries?: number;
	/** Sustained request rate for the whole client. Defaults to 240. Roblox allows 500 per server. */
	readonly requestsPerMinute?: number;
	/** Burst size for the rate limiter. Defaults to 24. */
	readonly burst?: number;
	/** Requests in flight at once. Defaults to 4. */
	readonly maxConcurrent?: number;
	/** How long to keep a judged answer, in milliseconds. Defaults to 0, which turns caching off. */
	readonly cacheTtlMs?: number;
	/** The most cached answers to keep. Defaults to 256. */
	readonly cacheMaxEntries?: number;
	/** Prints each set's shape on define and on the first ask path, and logs
	 * retries and errors. */
	readonly debug?: boolean;
	/** Called for request, response, retry, cache hit, and error events. */
	readonly onEvent?: (event: JevEvent) => void;
}

/** A per-player request budget for exposed question sets. */
export interface PerPlayerLimit {
	/** Sustained requests per minute for each player. */
	readonly requestsPerMinute: number;
	/** Burst size. Defaults to a quarter of the per-minute budget, at least one. */
	readonly burst?: number;
}

/** Options for `Jev.expose`. */
export interface ExposeOptions {
	/** Where to create the remotes folder. Defaults to `ReplicatedStorage`. */
	readonly parent?: Instance;
	/** A per-player rate limit. Without it, a client can call as fast as the network allows. */
	readonly perPlayer?: PerPlayerLimit;
	/** Runs before a player's request reaches the model. Return false to deny. */
	readonly authorize?: (player: Player, setName: string, state: JsonValue) => boolean;
}

/** The shape `expose` needs from a question set. Any value from `questions` fits. */
export interface NamedQuestionSet {
	readonly name: string;
	readonly ids: ReadonlyArray<string>;
	readonly questions: QuestionMap;
}

/** Question sets keyed by the name a client will use to ask for them. */
export type ExposedSets = { readonly [key: string]: NamedQuestionSet };

/** What `expose` returns. */
export interface Exposed<E extends ExposedSets> {
	readonly sets: E;
	readonly folder: Folder;
}

/** The server-side client returned by `createJev`. */
export interface Jev {
	/** Asks every question in the set about `state`. Rejects with a `JevError` on failure. */
	ask<Q extends QuestionMap>(state: JsonValue, set: QuestionSet<Q>, options?: AskOptions): Promise<AskResult<Q>>;
	/** Like `ask`, but resolves with a `Result` and never rejects. */
	attempt<Q extends QuestionMap>(
		state: JsonValue,
		set: QuestionSet<Q>,
		options?: AskOptions,
	): Promise<Result<AskResult<Q>, JevError>>;
	/** Runs one call per state, bounded by the same scheduler, and never rejects. */
	attemptAll<Q extends QuestionMap>(
		states: ReadonlyArray<JsonValue>,
		set: QuestionSet<Q>,
		options?: AskOptions,
	): Promise<ReadonlyArray<Result<AskResult<Q>, JevError>>>;
	/** Registers a set for `definitions()` and `preview()`. Returns the same set so
	 * it can be used inline. */
	define<Q extends QuestionMap, N extends string>(set: QuestionSet<Q, N>): QuestionSet<Q, N>;
	/** Every set this client has seen, as runtime descriptions. */
	definitions(): ReadonlyArray<DefinitionSummary>;
	/** The text block describing one set, or all sets when no name is given. */
	preview(name?: string): string;
	/** Request, retry, cache, and error counters. */
	stats(): EngineStats;
	/** Drops every cached answer. */
	clearCache(): void;
	/** Lets clients ask for the given sets by name. Clients never send instructions or pick a model. */
	expose<E extends ExposedSets>(sets: E, options?: ExposeOptions): Exposed<E>;
}

/** The client-side half, returned by `createJevClient`. */
export interface JevClient<E extends ExposedSets> {
	/** Asks the server to answer a named set. Rejects with a `JevError` on failure. */
	ask<K extends Extract<keyof E, string>>(
		name: K,
		state: JsonValue,
	): Promise<AnswersOf<E[K]["questions"]>>;
	/** Like `ask`, but resolves with a `Result` and never rejects. */
	attempt<K extends Extract<keyof E, string>>(
		name: K,
		state: JsonValue,
	): Promise<Result<AnswersOf<E[K]["questions"]>, JevError>>;
	/** The sets the server exposes and their answer shapes. */
	preview(): ReadonlyArray<DefinitionSummary>;
}

/** Options for `createJevClient`. */
export interface JevClientOptions {
	/** Where to look for the remotes folder. Defaults to `ReplicatedStorage`. */
	readonly parent?: Instance;
}
