import { JevError } from "./errors";
import type { JsonArray, JsonObject, JsonValue } from "./json";

/** Content accepted by `instructions` and by criteria descriptions. */
export type Entry = string | JsonArray | JsonObject;

/** A question that selects one of a fixed set of options. */
export interface ChoiceQuestion<O extends string = string> {
	readonly type: "choice";
	readonly instructions: Entry;
	readonly criteria: { readonly [key: string]: Entry | undefined };
	/** Lua tables keep no declaration order, so `choice` sorts options
	 * alphabetically. `oneOf` keeps the order you pass. */
	readonly options: ReadonlyArray<O>;
}

/** A question that rates the state against ordered levels. */
export interface ScoreQuestion<L extends Entry = Entry> {
	readonly type: "score";
	readonly instructions: Entry;
	/** Ordered levels. Position is the score, starting at zero. */
	readonly criteria: ReadonlyArray<L>;
}

/** Optional descriptions of what a yes and a no mean. */
export interface NoulCriteria {
	readonly true?: Entry;
	readonly false?: Entry;
}

/** A yes/no question answered with a probability. */
export interface NoulQuestion {
	readonly type: "noul";
	readonly instructions: Entry;
	readonly criteria?: NoulCriteria;
}

/** A question that locates something in an image. */
export interface BoxQuestion {
	readonly type: "box";
	readonly instructions: Entry;
}

/** Any question type. */
export type AnyQuestion = ChoiceQuestion | ScoreQuestion | NoulQuestion | BoxQuestion;

/** Question ids mapped to their questions. */
export type QuestionMap = { readonly [key: string]: AnyQuestion };

/** A named group of questions that is asked together in one request. Create one with `questions`. */
export interface QuestionSet<Q extends QuestionMap = QuestionMap, N extends string = string> {
	readonly name: N;
	readonly ids: ReadonlyArray<Extract<keyof Q, string>>;
	readonly questions: Q;
}

/** The most options a Choice question may have. */
export const MAX_CHOICES = 255;
/** The most levels a Score question may have. */
export const MAX_LEVELS = 10;

function invalidDefinition(message: string): never {
	throw new JevError({ kind: "invalid_definition", message });
}

function countOf<T>(values: ReadonlyArray<T>): number {
	let count = 0;
	for (const _ of values) {
		count += 1;
	}
	return count;
}

function assertEntry(value: unknown, where: string): void {
	if (typeIs(value, "string") || typeIs(value, "table")) {
		return;
	}
	invalidDefinition(`${where} must be a string, an object, or an array`);
}

function assertQuestion(id: string, question: AnyQuestion): void {
	if (id === "") {
		invalidDefinition("question ids must be non-empty strings");
	}
	assertEntry(question.instructions, `question "${id}" instructions`);

	if (question.type === "choice") {
		const optionCount = countOf(question.options);
		if (optionCount < 1 || optionCount > MAX_CHOICES) {
			invalidDefinition(`choice "${id}" must have between 1 and ${MAX_CHOICES} options, got ${optionCount}`);
		}
		for (const option of question.options) {
			const description = question.criteria[option];
			if (description !== undefined) {
				assertEntry(description, `choice "${id}" option "${option}"`);
			}
		}
	} else if (question.type === "score") {
		const levelCount = countOf(question.criteria);
		if (levelCount < 1 || levelCount > MAX_LEVELS) {
			invalidDefinition(`score "${id}" must have between 1 and ${MAX_LEVELS} levels, got ${levelCount}`);
		}
		for (const level of question.criteria) {
			assertEntry(level, `score "${id}" level`);
		}
	} else if (question.type === "noul") {
		const criteria = question.criteria;
		if (criteria !== undefined) {
			if (criteria.true !== undefined) assertEntry(criteria.true, `noul "${id}" criteria.true`);
			if (criteria.false !== undefined) assertEntry(criteria.false, `noul "${id}" criteria.false`);
		}
	}
}

/** Throws an `invalid_definition` error when a set breaks the API limits. */
export function assertDefinition(name: string, ids: ReadonlyArray<string>, questions: QuestionMap): void {
	if (name === "") {
		invalidDefinition("a question set needs a non-empty name");
	}
	if (countOf(ids) === 0) {
		invalidDefinition(`question set "${name}" has no questions`);
	}
	for (const id of ids) {
		const question = questions[id];
		if (question === undefined) {
			invalidDefinition(`question set "${name}" is missing question "${id}"`);
		}
		assertQuestion(id, question);
	}
}

/** A Choice question. Descriptions are optional. */
export function choice<O extends string>(
	instructions: Entry,
	criteria: { readonly [K in O]?: Entry },
): ChoiceQuestion<O> {
	const options = new Array<O>();
	for (const [key] of pairs(criteria as { [key: string]: defined })) {
		options.push(tostring(key) as unknown as O);
	}
	options.sort();
	const question: ChoiceQuestion<O> = {
		type: "choice",
		instructions,
		criteria: criteria as { readonly [key: string]: Entry | undefined },
		options,
	};
	assertQuestion("<inline>", question as unknown as AnyQuestion);
	return question;
}

/** Undescribed Choice options in one call, e.g. `oneOf("Which team?", "billing", "sales")`. */
export function oneOf<O extends readonly string[]>(
	instructions: Entry,
	...options: O
): ChoiceQuestion<O[number]> {
	const criteria: { [key: string]: Entry | undefined } = {};
	const ordered = new Array<O[number]>();
	for (const option of options) {
		criteria[option] = undefined;
		ordered.push(option);
	}
	const question: ChoiceQuestion<O[number]> = {
		type: "choice",
		instructions,
		criteria: criteria as { readonly [key: string]: Entry | undefined },
		options: ordered,
	};
	assertQuestion("<inline>", question as unknown as AnyQuestion);
	return question;
}

/** A Score question. Levels are ordered, and the position of a level is its score. */
export function score<L extends readonly Entry[]>(
	instructions: Entry,
	...levels: L
): ScoreQuestion<L[number]> {
	const question: ScoreQuestion<L[number]> = { type: "score", instructions, criteria: levels };
	assertQuestion("<inline>", question as unknown as AnyQuestion);
	return question;
}

/** A yes/no probability question. */
export function noul(instructions: Entry, criteria?: NoulCriteria): NoulQuestion {
	const question: NoulQuestion = { type: "noul", instructions, criteria };
	assertQuestion("<inline>", question);
	return question;
}

/** A bounding box question over an image. Requires an image in the state and the
 * preview model. */
export function box(instructions: Entry): BoxQuestion {
	const question: BoxQuestion = { type: "box", instructions };
	assertQuestion("<inline>", question);
	return question;
}

/** Groups questions into a set. Pass a name first to label the set in previews and remote calls. */
export function questions<Q extends QuestionMap>(set: Q): QuestionSet<Q, "anonymous">;
export function questions<N extends string, Q extends QuestionMap>(name: N, set: Q): QuestionSet<Q, N>;
export function questions(a: unknown, b?: unknown): QuestionSet<QuestionMap, string> {
	const named = b !== undefined;
	const name = named ? (a as string) : "anonymous";
	const raw = (named ? b : a) as QuestionMap;
	const ids = new Array<string>();
	for (const [key] of pairs(raw as { [key: string]: defined })) {
		ids.push(tostring(key));
	}
	ids.sort();
	assertDefinition(name, ids, raw);
	const set: QuestionSet<QuestionMap, string> = { name, ids, questions: raw as QuestionMap };
	return set;
}

/** A one-line description of a question: its id, type, and answer shape. */
export interface QuestionSummary {
	readonly id: string;
	readonly type: AnyQuestion["type"];
	readonly detail: string;
}

/** A runtime description of a question set. */
export interface DefinitionSummary {
	readonly name: string;
	readonly questions: ReadonlyArray<QuestionSummary>;
}

function levelLabel(level: Entry): string {
	if (typeIs(level, "string")) {
		return level as string;
	}
	return "(structured)";
}

function describeOne(id: string, question: AnyQuestion): QuestionSummary {
	if (question.type === "choice") {
		const names = new Array<string>();
		for (const option of question.options) {
			names.push(option);
		}
		return { id, type: "choice", detail: `options: ${names.join(" | ")}` };
	}
	if (question.type === "score") {
		const levels = new Array<string>();
		for (const level of question.criteria) {
			levels.push(levelLabel(level));
		}
		return { id, type: "score", detail: `${countOf(question.criteria)} levels: ${levels.join(" | ")}` };
	}
	if (question.type === "noul") {
		return { id, type: "noul", detail: "probability 0..1" };
	}
	return { id, type: "box", detail: "box edges, fractions of width and height" };
}

/** The runtime preview of a question set: what each id will answer, and in what
 * shape. This is what `preview()` prints and what a client can fetch. */
export function describeQuestionSet<Q extends QuestionMap>(set: QuestionSet<Q>): DefinitionSummary {
	const summaries = new Array<QuestionSummary>();
	for (const id of set.ids) {
		const question = set.questions[id];
		if (question !== undefined) {
			summaries.push(describeOne(id, question));
		}
	}
	return { name: set.name, questions: summaries };
}

/** Formats a summary as the text block that `preview` prints. */
export function formatDefinition(summary: DefinitionSummary): string {
	const lines = new Array<string>();
	lines.push(summary.name);
	for (const question of summary.questions) {
		lines.push(`  ${question.id}  ${question.type}  ${question.detail}`);
	}
	return lines.join("\n");
}

/** Describes and formats a question set in one step. */
export function formatQuestionSet<Q extends QuestionMap>(set: QuestionSet<Q>): string {
	return formatDefinition(describeQuestionSet(set));
}

function wireChoice(question: ChoiceQuestion): JsonObject {
	const criteria: { [key: string]: JsonValue } = {};
	for (const option of question.options) {
		const description = question.criteria[option];
		// Roblox cannot encode JSON null, and the API needs at least one option, so an
		// undescribed option is sent with its own name, which the API treats the same.
		criteria[option] = description !== undefined ? description : option;
	}
	const wire: { [key: string]: JsonValue } = {};
	wire.type = "choice";
	wire.instructions = question.instructions;
	wire.criteria = criteria;
	return wire;
}

/** Converts one question to the JSON shape the API expects. */
export function toWireQuestion(question: AnyQuestion): JsonObject {
	if (question.type === "choice") {
		return wireChoice(question);
	}
	const wire: { [key: string]: JsonValue } = {};
	wire.type = question.type;
	wire.instructions = question.instructions;
	if (question.type === "score") {
		wire.criteria = question.criteria;
	} else if (question.type === "noul" && question.criteria !== undefined) {
		const criteria: { [key: string]: JsonValue } = {};
		if (question.criteria.true !== undefined) criteria.true = question.criteria.true;
		if (question.criteria.false !== undefined) criteria.false = question.criteria.false;
		wire.criteria = criteria;
	}
	return wire;
}

/** Converts a whole set to the JSON shape the API expects. */
export function toWireQuestions<Q extends QuestionMap>(set: QuestionSet<Q>): JsonObject {
	const wire: { [key: string]: JsonValue } = {};
	for (const id of set.ids) {
		const question = set.questions[id];
		if (question !== undefined) {
			wire[id] = toWireQuestion(question);
		}
	}
	return wire;
}

/** Whether the set contains a Box question, which needs the images header. */
export function questionSetNeedsImages<Q extends QuestionMap>(set: QuestionSet<Q>): boolean {
	for (const id of set.ids) {
		const question = set.questions[id];
		if (question !== undefined && question.type === "box") {
			return true;
		}
	}
	return false;
}
