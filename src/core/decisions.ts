import type { AnyAnswer, BoxAnswer, BoxCoordinates, ChoiceAnswer, NoulAnswer, ScoreAnswer } from "./answers";
import { clamp01, noulConfidence } from "./confidence";
import { JevError, isJevError, toJevError } from "./errors";
import { err, ok, type Result } from "./result";

/** What to do with an answer: `act` on it, `confirm` it first, or `reject` it. */
export type Verdict = "act" | "confirm" | "reject";

/** Thresholds applied to an answer's confidence (Choice, Score, Box) or to its
 * probability (Noul). If `act` is below `reject`, the two are swapped; both are
 * clamped to 0..1. */
export interface Gate {
	readonly act: number;
	readonly reject: number;
}

/** An answer together with the verdict the gate gave it. */
export interface Decision<T> {
	readonly verdict: Verdict;
	readonly value: T;
	readonly confidence: number;
}

/** Default gate for Choice, Score, and Box answers, applied to confidence. */
export const DEFAULT_CONFIDENCE_GATE: Gate = { act: 0.8, reject: 0.45 };
/** Default gate for Noul answers, applied to the probability itself. */
export const DEFAULT_PROBABILITY_GATE: Gate = { act: 0.7, reject: 0.3 };

/** A Noul answer as a decision value: `yes` at or above 0.5, otherwise `no`. */
export type NoulValue = "yes" | "no";

function normalizeGate(gate: Gate): Gate {
	const low = clamp01(gate.reject);
	const high = clamp01(gate.act);
	return high < low ? { act: low, reject: high } : { act: high, reject: low };
}

function verdictFor(confidence: number, gate: Gate): Verdict {
	if (confidence >= gate.act) {
		return "act";
	}
	if (confidence < gate.reject) {
		return "reject";
	}
	return "confirm";
}

/** Gates a Choice answer on its confidence. The value is the chosen option. */
export function decide<O extends string>(answer: ChoiceAnswer<O>, gate?: Gate): Decision<O>;
/** Turns a Score answer into a decision whose value is the fractional score. */
export function decide(answer: ScoreAnswer, gate?: Gate): Decision<number>;
/** Turns a Noul answer into yes or no, gated on the probability itself. */
export function decide(answer: NoulAnswer, gate?: Gate): Decision<NoulValue>;
/** The value is always the box. A missing confidence is treated as 0. */
export function decide(answer: BoxAnswer, gate?: Gate): Decision<BoxCoordinates>;
export function decide(answer: AnyAnswer, gate?: Gate): Decision<unknown> {
	if (answer.type === "noul") {
		const threshold = normalizeGate(gate ?? DEFAULT_PROBABILITY_GATE);
		return {
			verdict: verdictFor(answer.noul, threshold),
			value: answer.noul >= 0.5 ? "yes" : "no",
			confidence: noulConfidence(answer.noul),
		};
	}

	const threshold = normalizeGate(gate ?? DEFAULT_CONFIDENCE_GATE);
	if (answer.type === "choice") {
		return { verdict: verdictFor(answer.confidence, threshold), value: answer.choice, confidence: answer.confidence };
	}
	if (answer.type === "score") {
		return { verdict: verdictFor(answer.confidence, threshold), value: answer.score, confidence: answer.confidence };
	}
	return { verdict: verdictFor(answer.confidence ?? 0, threshold), value: answer.box, confidence: answer.confidence ?? 0 };
}

/** One handler per verdict. `confirm` is optional and falls back to `reject`. */
export interface DecisionHandlers<T, R> {
	readonly act: (value: T, decision: Decision<T>) => R;
	/** Called when confidence is between the reject and act thresholds. Falls back
	 * to the reject handler when omitted. */
	readonly confirm?: (value: T, decision: Decision<T>) => R;
	readonly reject: (value: T, decision: Decision<T>) => R;
}

function handlerError(caught: unknown, decision: Decision<unknown>): JevError {
	if (isJevError(caught)) {
		return caught;
	}
	return new JevError({
		kind: "handler",
		message: `decision handler for verdict "${decision.verdict}" threw`,
		cause: caught,
	});
}

function selectHandler<T, R>(decision: Decision<T>, handlers: DecisionHandlers<T, R>): (value: T, decision: Decision<T>) => R {
	if (decision.verdict === "act") {
		return handlers.act;
	}
	if (decision.verdict === "confirm") {
		return handlers.confirm ?? handlers.reject;
	}
	return handlers.reject;
}

/** Delegates a decision to the caller's handlers. A throw inside a handler is
 * captured as a `handler` error instead of escaping. */
export function delegate<T, R>(decision: Decision<T>, handlers: DecisionHandlers<T, R>): Result<R, JevError> {
	const handler = selectHandler(decision, handlers);
	try {
		return ok(handler(decision.value, decision));
	} catch (caught) {
		return err(handlerError(caught, decision as unknown as Decision<unknown>));
	}
}

/** Async variant of `delegate`. Awaits the handler and captures both synchronous
 * throws and promise rejections. */
export async function delegateAsync<T, R>(
	decision: Decision<T>,
	handlers: DecisionHandlers<T, Promise<R> | R>,
): Promise<Result<R, JevError>> {
	const handler = selectHandler(decision, handlers);
	try {
		const value = (await handler(decision.value, decision)) as R;
		return ok(value);
	} catch (caught) {
		return err(handlerError(caught, decision as unknown as Decision<unknown>));
	}
}

export const match = delegate;

export const matchAsync = delegateAsync;

/** Re-raises a captured handler error for callers that prefer exceptions. */
export function unwrapOrThrow<T>(result: Result<T, JevError>): T {
	if (result.ok) {
		return result.value;
	}
	throw result.error;
}

export { toJevError };

/** Options for `routeChoice`. */
export interface RouteChoiceOptions<O extends string, R> {
	readonly gate?: Gate;
	/** Called when the answer is not confident enough to act. When omitted, the
	 * route returns an `undecided` error. */
	readonly onUnsure?: (answer: ChoiceAnswer<O>, decision: Decision<O>) => R;
}

/** Delegates a Choice answer to one handler per option. Every option needs a
 * handler, so adding an option is a compile error until it is handled. */
export function routeChoice<O extends string, R>(
	answer: ChoiceAnswer<O>,
	handlers: { readonly [K in O]: (answer: ChoiceAnswer<O>) => R },
	options: RouteChoiceOptions<O, R> = {},
): Result<R, JevError> {
	const decision = decide(answer, options.gate);
	if (decision.verdict === "act") {
		try {
			return ok(handlers[decision.value](answer));
		} catch (caught) {
			return err(handlerError(caught, decision as unknown as Decision<unknown>));
		}
	}
	if (options.onUnsure !== undefined) {
		try {
			return ok(options.onUnsure(answer, decision));
		} catch (caught) {
			return err(handlerError(caught, decision as unknown as Decision<unknown>));
		}
	}
	return err(
		new JevError({
			kind: "undecided",
			message: `Answer chose "${answer.choice}" with confidence ${answer.confidence}, below the act threshold.`,
		}),
	);
}
