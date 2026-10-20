import { choiceConfidence, clamp01, scoreConfidence } from "./confidence";
import { JevError } from "./errors";
import type { Entry, QuestionMap, QuestionSet, ScoreQuestion } from "./questions";
import { err, ok, type Result } from "./result";

export interface ChoiceAnswer<O extends string = string> {
	readonly type: "choice";
	readonly choice: O;
	readonly confidence: number;
	readonly probabilities: { readonly [K in O]: number };
}

export interface ScoreAnswer<L extends Entry = Entry> {
	readonly type: "score";
	/** Probability-weighted position along the levels. May fall between levels. */
	readonly score: number;
	readonly confidence: number;
	readonly legend: { readonly [key: string]: L };
	readonly probabilities: { readonly [key: string]: number };
}

export interface NoulAnswer {
	readonly type: "noul";
	/** Probability that the answer is yes, from 0 to 1. */
	readonly noul: number;
}

export interface BoxCoordinates {
	readonly top: number;
	readonly bottom: number;
	readonly left: number;
	readonly right: number;
}

export interface BoxAnswer {
	readonly type: "box";
	readonly box: BoxCoordinates;
	/** Undefined when the model does not report confidence. */
	readonly confidence: number | undefined;
}

export type AnyAnswer = ChoiceAnswer | ScoreAnswer | NoulAnswer | BoxAnswer;

export type AnswerOf<Q> = Q extends { readonly type: "choice"; readonly options: ReadonlyArray<infer O extends string> }
	? ChoiceAnswer<O>
	: Q extends ScoreQuestion<infer L>
		? ScoreAnswer<L>
		: Q extends { readonly type: "noul" }
			? NoulAnswer
			: Q extends { readonly type: "box" }
				? BoxAnswer
				: never;

export type AnswersOf<Q extends QuestionMap> = { readonly [K in keyof Q]: AnswerOf<Q[K]> };

export interface Usage {
	readonly input_tokens: number;
	readonly output_tokens: number;
}

export interface AskResult<Q extends QuestionMap> {
	readonly answers: AnswersOf<Q>;
	readonly model: string;
	readonly usage: Usage;
	/** Measured around the whole call, including queueing and retries. */
	readonly latencyMs: number;
	readonly cached: boolean;
}

const INFINITY = 1 / 0;

function isFiniteNumber(value: unknown): value is number {
	return typeIs(value, "number") && value === value && value !== INFINITY && value !== -INFINITY;
}

function readField(record: unknown, key: string): unknown {
	if (!typeIs(record, "table")) {
		return undefined;
	}
	return (record as { [field: string]: unknown })[key];
}

function readString(record: unknown, key: string): string | undefined {
	const value = readField(record, key);
	return typeIs(value, "string") ? (value as string) : undefined;
}

function readNumber(record: unknown, key: string): number | undefined {
	const value = readField(record, key);
	return isFiniteNumber(value) ? (value as number) : undefined;
}

function readTable(record: unknown, key: string): unknown {
	const value = readField(record, key);
	return typeIs(value, "table") ? value : undefined;
}

function countOf<T>(values: ReadonlyArray<T>): number {
	let count = 0;
	for (const _ of values) {
		count += 1;
	}
	return count;
}

function includes(values: ReadonlyArray<string>, needle: string): boolean {
	for (const value of values) {
		if (value === needle) {
			return true;
		}
	}
	return false;
}

function malformed(questionId: string, reason: string): JevError {
	return new JevError({
		kind: "malformed_response",
		message: `answer for "${questionId}" is malformed: ${reason}`,
		questionId,
	});
}

function parseChoice<O extends string>(
	raw: unknown,
	question: { readonly options: ReadonlyArray<O> },
	questionId: string,
): Result<ChoiceAnswer<O>, JevError> {
	if (!typeIs(raw, "table")) {
		return err(malformed(questionId, "expected a table"));
	}
	const selected = readString(raw, "choice");
	if (selected === undefined) {
		return err(malformed(questionId, "missing `choice`"));
	}
	if (!includes(question.options as ReadonlyArray<string>, selected)) {
		return err(malformed(questionId, `selected choice "${selected}" is not one of the options`));
	}

	const probabilities = {} as { [K in O]: number };
	const ordered = new Array<number>();
	const rawProbabilities = readTable(raw, "probabilities");
	for (const option of question.options) {
		const value = rawProbabilities === undefined ? undefined : readNumber(rawProbabilities, option);
		const probability = value === undefined ? 0 : value;
		if (probability < 0 || probability > 1) {
			return err(malformed(questionId, `probability for "${option}" is outside 0..1`));
		}
		probabilities[option] = probability;
		ordered.push(probability);
	}

	const reported = readNumber(raw, "confidence");
	const confidence =
		reported !== undefined ? clamp01(reported) : rawProbabilities === undefined ? 0 : choiceConfidence(ordered);

	const answer: ChoiceAnswer<O> = {
		type: "choice",
		choice: selected as O,
		confidence,
		probabilities,
	};
	return ok(answer);
}

function parseScore<L extends Entry>(
	raw: unknown,
	question: ScoreQuestion<L>,
	questionId: string,
): Result<ScoreAnswer<L>, JevError> {
	if (!typeIs(raw, "table")) {
		return err(malformed(questionId, "expected a table"));
	}
	const value = readNumber(raw, "score");
	if (value === undefined) {
		return err(malformed(questionId, "missing `score`"));
	}

	const levelCount = countOf(question.criteria);
	const ordered = new Array<number>();
	const rawProbabilities = readTable(raw, "probabilities");
	for (let index = 0; index < levelCount; index += 1) {
		const key = tostring(index);
		const probability = rawProbabilities === undefined ? undefined : readNumber(rawProbabilities, key);
		const normalized = probability === undefined ? 0 : probability;
		if (normalized < 0 || normalized > 1) {
			return err(malformed(questionId, `probability for level ${key} is outside 0..1`));
		}
		ordered.push(normalized);
	}

	const probabilities = {} as { [key: string]: number };
	for (let index = 0; index < levelCount; index += 1) {
		probabilities[tostring(index)] = ordered[index];
	}

	const legend = {} as { [key: string]: L };
	for (let index = 0; index < levelCount; index += 1) {
		legend[tostring(index)] = question.criteria[index];
	}

	const reported = readNumber(raw, "confidence");
	const confidence =
		reported !== undefined ? clamp01(reported) : rawProbabilities === undefined ? 0 : scoreConfidence(ordered);

	const answer: ScoreAnswer<L> = { type: "score", score: value, confidence, legend, probabilities };
	return ok(answer);
}

function parseNoul(raw: unknown, questionId: string): Result<NoulAnswer, JevError> {
	if (!typeIs(raw, "table")) {
		return err(malformed(questionId, "expected a table"));
	}
	const probability = readNumber(raw, "noul");
	if (probability === undefined) {
		return err(malformed(questionId, "missing `noul`"));
	}
	if (probability < 0 || probability > 1) {
		return err(malformed(questionId, "`noul` is outside 0..1"));
	}
	return ok({ type: "noul", noul: probability });
}

function parseBox(raw: unknown, questionId: string): Result<BoxAnswer, JevError> {
	if (!typeIs(raw, "table")) {
		return err(malformed(questionId, "expected a table"));
	}
	const box = readTable(raw, "box");
	if (box === undefined) {
		return err(malformed(questionId, "missing `box`"));
	}
	const top = readNumber(box, "top");
	const bottom = readNumber(box, "bottom");
	const left = readNumber(box, "left");
	const right = readNumber(box, "right");
	if (top === undefined || bottom === undefined || left === undefined || right === undefined) {
		return err(malformed(questionId, "`box` needs top, bottom, left, and right"));
	}
	if (top < 0 || bottom > 1 || left < 0 || right > 1 || top > bottom || left > right) {
		return err(malformed(questionId, "`box` edges are out of order or outside 0..1"));
	}
	const confidence = readNumber(raw, "confidence");
	return ok({
		type: "box",
		box: { top, bottom, left, right },
		confidence: confidence === undefined ? undefined : clamp01(confidence),
	});
}

/** Validates an answer payload against the question set that produced it. A
 * malformed answer fails the whole call instead of leaking a partial table. */
export function parseAnswers<Q extends QuestionMap>(
	raw: unknown,
	set: QuestionSet<Q>,
): Result<AnswersOf<Q>, JevError> {
	if (!typeIs(raw, "table")) {
		return err(new JevError({ kind: "malformed_response", message: "response `answers` is not a table" }));
	}

	const answers: { [key: string]: unknown } = {};
	for (const id of set.ids) {
		const question = set.questions[id];
		if (question === undefined) {
			continue;
		}
		const rawAnswer = (raw as { [key: string]: unknown })[id];
		if (rawAnswer === undefined) {
			return err(malformed(id, "missing from the response"));
		}

		if (question.type === "choice") {
			const parsed = parseChoice(rawAnswer, question, id);
			if (!parsed.ok) return parsed;
			answers[id] = parsed.value;
		} else if (question.type === "score") {
			const parsed = parseScore(rawAnswer, question, id);
			if (!parsed.ok) return parsed;
			answers[id] = parsed.value;
		} else if (question.type === "noul") {
			const parsed = parseNoul(rawAnswer, id);
			if (!parsed.ok) return parsed;
			answers[id] = parsed.value;
		} else {
			const parsed = parseBox(rawAnswer, id);
			if (!parsed.ok) return parsed;
			answers[id] = parsed.value;
		}
	}

	return ok(answers as unknown as AnswersOf<Q>);
}

function parseUsage(raw: unknown): Usage {
	const input = readNumber(raw, "input_tokens");
	const output = readNumber(raw, "output_tokens");
	return { input_tokens: input === undefined ? 0 : input, output_tokens: output === undefined ? 0 : output };
}

export interface ParsedResponse<Q extends QuestionMap> {
	readonly answers: AnswersOf<Q>;
	readonly model: string;
	readonly usage: Usage;
}

export function parseSystemOneResponse<Q extends QuestionMap>(
	raw: unknown,
	set: QuestionSet<Q>,
): Result<ParsedResponse<Q>, JevError> {
	if (!typeIs(raw, "table")) {
		return err(new JevError({ kind: "malformed_response", message: "response is not a table" }));
	}
	const model = readString(raw, "model");
	if (model === undefined) {
		return err(new JevError({ kind: "malformed_response", message: "response is missing `model`" }));
	}
	const answers = parseAnswers(readTable(raw, "answers"), set);
	if (!answers.ok) {
		return answers;
	}
	return ok({ answers: answers.value, model, usage: parseUsage(readTable(raw, "usage")) });
}
