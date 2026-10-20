/** The success case of a `Result`. */
export interface Ok<T> {
	readonly ok: true;
	readonly value: T;
}

/** The failure case of a `Result`. */
export interface Err<E> {
	readonly ok: false;
	readonly error: E;
}

/** An explicit success or failure. Used where a rejected promise would force the
 * caller into try/catch, such as delegating a decision to a handler. */
export type Result<T, E> = Ok<T> | Err<E>;

/** Wraps a value as a successful `Result`. */
export function ok<T>(value: T): Ok<T> {
	return { ok: true, value };
}

/** Wraps a failure as a failed `Result`. */
export function err<E>(failure: E): Err<E> {
	return { ok: false, error: failure };
}

/** Narrows a `Result` to its success case. */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
	return result.ok;
}

/** Narrows a `Result` to its failure case. */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
	return !result.ok;
}

/** Transforms the value of a successful `Result` and leaves a failure untouched. */
export function mapResult<T, U, E>(result: Result<T, E>, project: (value: T) => U): Result<U, E> {
	return result.ok ? ok(project(result.value)) : result;
}

/** Transforms the failure of a `Result` and leaves a success untouched. */
export function mapError<T, E, F>(result: Result<T, E>, project: (failure: E) => F): Result<T, F> {
	return result.ok ? result : err(project(result.error));
}

/** Returns the value of a success, or `fallback` for a failure. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
	return result.ok ? result.value : fallback;
}

/** Returns the value of a success, or computes one from the failure. */
export function getOrElse<T, E>(result: Result<T, E>, recover: (failure: E) => T): T {
	return result.ok ? result.value : recover(result.error);
}
