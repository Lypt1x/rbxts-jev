import type { AnswersOf, AskResult } from "../core/answers";
import type { AskOptions, EngineStats, JevEvent } from "../core/engine";
import type { JevError } from "../core/errors";
import type { JsonValue } from "../core/json";
import type { DefinitionSummary, QuestionMap, QuestionSet } from "../core/questions";
import type { Result } from "../core/result";

export interface JevOptions {
	/** Plain API key. Prefer `apiKeySecret` so the key never becomes a string. */
	readonly apiKey?: string;
	/** Name of a Roblox secret created in the Creator Dashboard. The value is read
	 * with `HttpService:GetSecret` and never becomes a printable string. */
	readonly apiKeySecret?: string;
	readonly model?: string;
	readonly baseUrl?: string;
	readonly timeoutMs?: number;
	readonly retries?: number;
	readonly requestsPerMinute?: number;
	readonly burst?: number;
	readonly maxConcurrent?: number;
	readonly cacheTtlMs?: number;
	readonly cacheMaxEntries?: number;
	/** Prints each set's shape on define and on the first ask path, and logs
	 * retries and errors. */
	readonly debug?: boolean;
	readonly onEvent?: (event: JevEvent) => void;
}

export interface PerPlayerLimit {
	readonly requestsPerMinute: number;
	/** Burst size. Defaults to a quarter of the per-minute budget, at least one. */
	readonly burst?: number;
}

export interface ExposeOptions {
	readonly parent?: Instance;
	readonly perPlayer?: PerPlayerLimit;
	/** Runs before a player's request reaches the model. Return false to deny. */
	readonly authorize?: (player: Player, setName: string, state: JsonValue) => boolean;
}

export interface NamedQuestionSet {
	readonly name: string;
	readonly ids: ReadonlyArray<string>;
	readonly questions: QuestionMap;
}

export type ExposedSets = { readonly [key: string]: NamedQuestionSet };

export interface Exposed<E extends ExposedSets> {
	readonly sets: E;
	readonly folder: Folder;
}

export interface Jev {
	ask<Q extends QuestionMap>(state: JsonValue, set: QuestionSet<Q>, options?: AskOptions): Promise<AskResult<Q>>;
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
	definitions(): ReadonlyArray<DefinitionSummary>;
	preview(name?: string): string;
	stats(): EngineStats;
	clearCache(): void;
	expose<E extends ExposedSets>(sets: E, options?: ExposeOptions): Exposed<E>;
}

export interface JevClient<E extends ExposedSets> {
	ask<K extends Extract<keyof E, string>>(
		name: K,
		state: JsonValue,
	): Promise<AnswersOf<E[K]["questions"]>>;
	attempt<K extends Extract<keyof E, string>>(
		name: K,
		state: JsonValue,
	): Promise<Result<AnswersOf<E[K]["questions"]>, JevError>>;
	preview(): ReadonlyArray<DefinitionSummary>;
}

export interface JevClientOptions {
	readonly parent?: Instance;
}
